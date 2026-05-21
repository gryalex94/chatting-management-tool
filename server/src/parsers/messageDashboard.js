const XLSX = require('xlsx');
const { supabaseAdmin } = require('../utils/supabase');
const { parseReplayTime, parseTextDate, parseSentTo, stripHtml, parseDollar } = require('../utils/parsers');
const { buildLookupMaps } = require('../utils/autoMatch');

async function parseMessageDashboard(fileBuffer, fileName, importId, orgId) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (!rows.length) throw new Error('Spreadsheet is empty');

  console.log(`Parsing ${rows.length} rows from Message Dashboard...`);

  console.log('Building lookup maps...');
  const { creatorMap, chatterMap } = await buildLookupMaps(rows, orgId, {
    creatorField: 'Creator',
    chatterField: 'Sender',
  });
  console.log(`Matched ${Object.keys(creatorMap).length} creators, ${Object.keys(chatterMap).length} chatters`);

  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const records = batch.map(row => {
      const sentTo = parseSentTo(row['Sent to']);
      const sentDate = parseTextDate(row['Sent date']);
      const sentTime = row['Sent time'] || null;
      let sentDatetime = null;
      if (sentDate && sentTime) sentDatetime = `${sentDate}T${sentTime}`;

      return {
        import_id: importId,
        sender_name: row['Sender'] || '',
        creator_name: row['Creator'] || '',
        creator_id: creatorMap[(row['Creator'] || '').trim()] || null,
        fan_message: row['Fans Message'] || null,
        creator_message: row['Creator Message'] || null,
        fan_message_text: stripHtml(row['Fans Message']),
        creator_message_text: stripHtml(row['Creator Message']),
        sent_time: sentTime,
        sent_date: sentDate,
        sent_datetime: sentDatetime,
        replay_time_raw: row['Replay time'] || null,
        replay_time_seconds: parseReplayTime(row['Replay time']),
        price: parseDollar(row['Price']),
        purchased: String(row['Purchased']).toLowerCase() === 'yes',
        source: row['Source'] || null,
        status: row['Status'] || null,
        sent_to_display: sentTo.display,
        sent_to_username: sentTo.username,
        sent_to_nickname: sentTo.nickname,
        organisation_id: orgId,
      };
    });

    const { error } = await supabaseAdmin.from('messages').insert(records);
    if (error) {
      console.error(`Batch insert error at row ${i}:`, error.message);
      throw error;
    }

    totalInserted += records.length;
    console.log(`Inserted ${totalInserted}/${rows.length} messages...`);
  }

  await updateSubscribers(importId, orgId);
  console.log(`Message Dashboard parsing complete: ${totalInserted} records`);
  return { rowCount: totalInserted };
}

async function updateSubscribers(importId, orgId) {
  const { data: purchases } = await supabaseAdmin
    .from('messages')
    .select('sent_to_username, sent_to_nickname, price, sent_date')
    .eq('import_id', importId)
    .eq('purchased', true)
    .gt('price', 0);

  if (!purchases || !purchases.length) return;

  const subMap = {};
  for (const p of purchases) {
    if (!p.sent_to_username) continue;
    if (!subMap[p.sent_to_username]) {
      subMap[p.sent_to_username] = {
        username: p.sent_to_username,
        display_name: p.sent_to_nickname,
        total_spend: 0,
        last_spend_date: p.sent_date,
      };
    }
    subMap[p.sent_to_username].total_spend += parseFloat(p.price) || 0;
  }

  for (const sub of Object.values(subMap)) {
    const { data: existing } = await supabaseAdmin
      .from('subscribers')
      .select('id, total_spend')
      .eq('username', sub.username)
      .eq('organisation_id', orgId)
      .single();

    if (existing) {
      await supabaseAdmin
        .from('subscribers')
        .update({
          total_spend: parseFloat(existing.total_spend) + sub.total_spend,
          display_name: sub.display_name,
          last_spend_date: sub.last_spend_date,
          last_seen: sub.last_spend_date,
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('subscribers')
        .insert({
          username: sub.username,
          display_name: sub.display_name,
          total_spend: sub.total_spend,
          organisation_id: orgId,
          first_seen: sub.last_spend_date,
          last_seen: sub.last_spend_date,
          last_spend_date: sub.last_spend_date,
        });
    }
  }
}

module.exports = { parseMessageDashboard };