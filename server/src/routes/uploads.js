const router = require('express').Router();
const multer = require('multer');
const { supabaseAdmin } = require('../utils/supabase');
const { requireMinRole } = require('../middleware/auth');
const { parseMessageDashboard } = require('../parsers/messageDashboard');
const { parseEmployeeReport } = require('../parsers/employeeReport');
const { parseCreatorStats } = require('../parsers/creatorStats');
const { importSubscriberSpend } = require('../parsers/subscriberSpend');

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

// POST /api/uploads/message-dashboard - Upload message dashboard report
router.post('/message-dashboard', requireMinRole('manager'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { report_date } = req.body;
    if (!report_date) return res.status(400).json({ error: 'Report date is required' });

    // Create import record
    const { data: importRecord, error: importError } = await supabaseAdmin
      .from('data_imports')
      .insert({
        organisation_id: req.user.organisationId,
        report_type: 'message_dashboard',
        file_name: req.file.originalname,
        uploaded_by: req.user.id,
        report_date,
        status: 'processing',
      })
      .select()
      .single();

    if (importError) return res.status(500).json({ error: importError.message });

    // Parse and store (async — returns immediately)
    res.status(202).json({
      message: 'File received, processing started',
      importId: importRecord.id,
    });

    // Process in background
    try {
      const result = await parseMessageDashboard(
        req.file.buffer,
        req.file.originalname,
        importRecord.id,
        req.user.organisationId,
        report_date
      );

      await supabaseAdmin
        .from('data_imports')
        .update({ status: 'completed', row_count: result.rowCount })
        .eq('id', importRecord.id);

      // Auto-populate chatter metrics from messages (new per-creator engine)
      const { computeChatterDailyMetrics } = require('../utils/computeChatterMetrics');
      computeChatterDailyMetrics(req.user.organisationId).catch(err =>
        console.error('Auto-populate metrics failed:', err)
      );
    } catch (parseErr) {
      console.error('Parse error:', parseErr);
      await supabaseAdmin
        .from('data_imports')
        .update({ status: 'failed', error_message: parseErr.message })
        .eq('id', importRecord.id);
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }

  });

// POST /api/uploads/employee-report - Upload employee report
router.post('/employee-report', requireMinRole('manager'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { report_date } = req.body;
    if (!report_date) return res.status(400).json({ error: 'Report date is required' });

    const { data: importRecord, error: importError } = await supabaseAdmin
      .from('data_imports')
      .insert({
        organisation_id: req.user.organisationId,
        report_type: 'employee_report',
        file_name: req.file.originalname,
        uploaded_by: req.user.id,
        report_date,
        status: 'processing',
      })
      .select()
      .single();

    if (importError) return res.status(500).json({ error: importError.message });

    res.status(202).json({
      message: 'File received, processing started',
      importId: importRecord.id,
    });

    try {
      const result = await parseEmployeeReport(
        req.file.buffer,
        req.file.originalname,
        importRecord.id,
        req.user.organisationId
      );

      await supabaseAdmin
        .from('data_imports')
        .update({ status: 'completed', row_count: result.rowCount })
        .eq('id', importRecord.id);

      // Auto-compute metrics from messages (per-creator, fixed reply times, AFK)
      const { computeChatterDailyMetrics } = require('../utils/computeChatterMetrics');
      computeChatterDailyMetrics(req.user.organisationId).catch(err =>
        console.error('Auto-compute metrics failed:', err)
      );
    } catch (parseErr) {
      console.error('Parse error:', parseErr);
      await supabaseAdmin
        .from('data_imports')
        .update({ status: 'failed', error_message: parseErr.message })
        .eq('id', importRecord.id);
    }
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /api/uploads/creator-stats - Upload creator statistics
router.post('/creator-stats', requireMinRole('manager'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { report_date } = req.body;
    if (!report_date) return res.status(400).json({ error: 'Report date is required' });

    const { data: importRecord, error: importError } = await supabaseAdmin
      .from('data_imports')
      .insert({
        organisation_id: req.user.organisationId,
        report_type: 'creator_statistics',
        file_name: req.file.originalname,
        uploaded_by: req.user.id,
        report_date,
        status: 'processing',
      })
      .select()
      .single();

    if (importError) return res.status(500).json({ error: importError.message });

    res.status(202).json({
      message: 'File received, processing started',
      importId: importRecord.id,
    });

    try {
      const result = await parseCreatorStats(
        req.file.buffer,
        req.file.originalname,
        importRecord.id,
        req.user.organisationId
      );

      await supabaseAdmin
        .from('data_imports')
        .update({ status: 'completed', row_count: result.rowCount })
        .eq('id', importRecord.id);
    } catch (parseErr) {
      console.error('Parse error:', parseErr);
      await supabaseAdmin
        .from('data_imports')
        .update({ status: 'failed', error_message: parseErr.message })
        .eq('id', importRecord.id);
    }
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/uploads/status/:id - Check import status
router.get('/status/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('data_imports')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// GET /api/uploads/history - List all imports
router.get('/history', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('data_imports')
      .select('*, users:uploaded_by(name)')
      .eq('organisation_id', req.user.organisationId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/uploads/subscriber-spend - Import sales history into subscribers ONLY
// (does not create chatters or store messages — safe for historical files with ex-staff)
router.post('/subscriber-spend', requireMinRole('manager'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const importRec = await supabaseAdmin
      .from('data_imports')
      .insert({
        organisation_id: req.user.organisationId,
        report_type: 'subscriber_spend',
        file_name: req.file.originalname,
        uploaded_by: req.user.id,
        status: 'processing',
      })
      .select().single();

    res.status(202).json({ message: 'Sales file received, importing spend', importId: importRec.data?.id });

    try {
      const result = await importSubscriberSpend(req.file.buffer, req.file.originalname, req.user.organisationId);
      if (importRec.data) {
        await supabaseAdmin.from('data_imports')
          .update({ status: 'completed', row_count: result.newSales })
          .eq('id', importRec.data.id);
      }
      console.log(`[Upload] subscriber-spend done:`, result);
    } catch (parseErr) {
      console.error('Spend import error:', parseErr);
      if (importRec.data) {
        await supabaseAdmin.from('data_imports')
          .update({ status: 'failed', error_message: parseErr.message })
          .eq('id', importRec.data.id);
      }
    }
  } catch (err) {
    console.error('Spend upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;