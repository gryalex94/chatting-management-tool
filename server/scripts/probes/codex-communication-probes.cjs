// Offline probes from the outside review of 22 October 2026 (Codex). They stub the database and the models
// and assert the BUGGY behaviour of commit 23f77cf, so after the fixes in AI_CHAT_FIX_PLAN_22_OCT.md they must
// fail on the fixed items. Run: node scripts/probes/codex-communication-probes.cjs /absolute/path/to/the/repository
// (writes communication-results.json next to itself). No model credentials are used.
// Offline probes of conversational planning and text processing, using synthetic examples.
// Usage: node communication-probes.cjs /absolute/path/to/repository-snapshot
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||__dirname);
const req=Module.createRequire(path.join(root,'package.json'));
const P=req('./server/src/ai/chat/prompts');
const Plan=req('./server/src/ai/chat/plan');
const S=req('./server/src/ai/chat/session');
const Mem=req('./server/src/ai/chat/memory');
const G=req('./server/src/ai/chat/gauges');
let calls=[];
const reviewCalls=[];
let writerText=JSON.stringify({messages:["I love a good question, you know."],learned:[],about_me:[],handover:''});
const reading={ids:[],level:0,mood:'chatty',pulled_back:false,answers:'straight',thread:'alive',doing:'small_talk',new:'',readings:[],curious:'',asked:[],promised:[],odd:false,stance:'steady'};
const records={
  creators:{id:'creator',organisation_id:'org',name:'Synthetic creator'},
  fanvue_accounts:{id:'account',is_ai_creator:true},
  ai_personas:{organisation_id:'org',creator_id:'creator',profile:{name:'Synthetic creator',age:'25',heat:'mild',facts:[]},settings:{emojis:'none'}},
};
class Query{
  constructor(t){this.t=t;this.one=false;this.off=0;}
  select(){return this;}eq(){return this;}in(){return this;}not(){return this;}gte(){return this;}order(){return this;}limit(){return this;}insert(){return this;}upsert(){return this;}update(){return this;}
  range(n){this.off=n;return this;}single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
  then(resolve,reject){const v=this.off?[]:records[this.t]??[];return Promise.resolve({data:this.one?(Array.isArray(v)?v[0]??null:v):v,error:null}).then(resolve,reject);}
}
const or={configured:()=>true,isOffered:()=>true,backupsFor:()=>[],DEFAULT_WRITER:'fixture/writer',writerLabel:x=>x,WRITERS:[],chat:async o=>{calls.push(o);return {text:o.model==='fixture/writer'?writerText:JSON.stringify(reading),model:o.model,usage:{cost:0},finish:'stop'};}};
const client={messages:{create:async o=>{
  reviewCalls.push(o);
  const props=o.output_config?.format?.schema?.properties||{};
  let a={ok:true,problems:[],problem:''};
  if(props.overall)a={overall:'good',summary:'Fixed offline fixture',answers_him:{verdict:'good'},understood:{verdict:'good'},fits_moment:{verdict:'good'},notes_facts:{verdict:'n/a'},selling:{verdict:'n/a'},lessons:{verdict:'n/a'}};
  return {stop_reason:'end_turn',usage:{},content:[{type:'text',text:JSON.stringify(a)}]};
}}};
const original=Module._load;
Module._load=function(name,parent,main){
  if(name==='./supabase'||name.endsWith('/supabase'))return {supabaseAdmin:{from:t=>new Query(t)}};
  if(name.endsWith('integrations/openrouter'))return or;
  if(name.endsWith('integrations/fanvue'))return {};
  if(name==='../agentRunner')return {client};
  return original.call(this,name,parent,main);
};
const enginePath=path.join(root,'server/src/utils/aiChat.js');
const m=new Module(enginePath,module);m.filename=enginePath;m.paths=Module._nodeModulePaths(path.dirname(enginePath));
m._compile(fs.readFileSync(enginePath,'utf8')+'\nmodule.exports._communicationAudit={pickCandidate,SHARES,HISTORY_GUESS,lessonsFor};',enginePath);
const A=m.exports;
const safety=req('./server/src/ai/chat/safety');
const out=[];
const record=(id,evidence)=>{out.push({id,...evidence});console.log(JSON.stringify(out.at(-1)));};
const profile=Plan.fanProfile({chat:[{from_fan:false,text:'I like painting.'},{from_fan:true,text:'Why do you like painting?'}],latest:['Why do you like painting?']});
const makePlan=(text,extra={})=>Plan.planReply({level:{his:0,max:0,mood:'chatty'},latest:[text],profile,herReplies:1,reading:{...reading,doing:'asking',asked:[text]},rand:()=>0,...extra});
(async()=>{
  // A useful repair control, then ordinary questions incorrectly treated the same way.
  assert.equal(makePlan('Why finally? I just subscribed').repair,true);
  const why=makePlan('Why do you like painting?');
  assert.equal(why.repair,true);assert.equal(why.answer_first,'');
  record('ordinary_question_becomes_repair',{input:'Why do you like painting?',repair:why.repair,answerFirst:why.answer_first,beats:why.beats});
  const wow=makePlan('Wow, that painting is beautiful');
  assert.equal(wow.repair,true);
  record('positive_reaction_becomes_repair',{input:'Wow, that painting is beautiful',repair:wow.repair,beats:wow.beats});
  const concerned=makePlan('Your eyes look tired, are you okay?');
  const negative=makePlan("I don't like your photos");
  assert.equal(concerned.complimented,true);assert.equal(negative.complimented,true);
  record('concern_and_negative_opinion_become_compliments',{concern:concerned.complimented,negativeOpinion:negative.complimented,concernBeats:concerned.beats});
  const third='My flatmate says someone is stealing her coffee.';
  const changed=P.tidyMessages([third],{emojis:'none'});
  assert.equal(changed[0],"My flatmate says you're stealing her coffee.");
  record('cleanup_changes_person_referred_to',{input:third,output:changed});
  const morning='I went hiking this morning. Your hiking trip sounded fun.';
  const dropped=P.dropSentences([morning],{his:'I really enjoy hiking'});
  assert.deepEqual(dropped,['Your hiking trip sounded fun.']);
  record('self_disclosure_removed_as_fan_time_guess',{input:morning,output:dropped});
  const ordered=['Did you mean the blue one?','If so, that is my favourite.'];
  const swapped=P.splitBubbles(ordered);
  assert.deepEqual(swapped,[ordered[1],ordered[0]]);
  record('question_reordering_breaks_dependency',{input:ordered,output:swapped});
  const sad=S.nextTurn({aim:'read',changes:[],mood:null,lighter:0,no_sell:''},{read:'sad',said:'The house feels empty since she left.'});
  const literal=S.nextTurn({aim:'read',changes:[],mood:null,lighter:0,no_sell:''},{read:'sad',said:'my dog died'});
  assert.equal(sad.mood,'chatty');assert.equal(literal.mood,'sad');
  record('implicit_sadness_read_discarded',{input:'The house feels empty since she left.',readerMood:'sad',effectiveMood:sad.mood,literalControl:literal.mood});
  const noQuestion=A._test.noQuestionWhy({latest:['I need to talk about something difficult']});
  assert.ok(noQuestion);
  const stripped=P.unQuestion(['That sounds difficult. What happened?'],{keep:0,his:'I need to talk about something difficult'});
  assert.deepEqual(stripped,['That sounds difficult.']);
  record('ordinary_need_suppresses_followup',{input:'I need to talk about something difficult',why:noQuestion,draft:['That sounds difficult. What happened?'],afterQuestionRule:stripped});
  const candidates=[{messages:['I live in Lisbon, and I love walking by the river after work.']},{messages:['I love a good question, you know.']}];
  const ranked=A._communicationAudit.pickCandidate(candidates,{plan:{goal:'chat',length:{target:'short'},ask:{allowed:true},answer_first:'He asked where you live; answer plainly first',beats:['answer his question plainly, in one line']},voice:{openers:[]}});
  assert.equal(ranked.draft,candidates[1]);
  record('candidate_ranker_prefers_nonanswer',{question:'Where do you live?',candidates:candidates.map(x=>x.messages),picked:ranked.draft.messages,scores:ranked.scores});
  writerText=JSON.stringify({messages:["Finally, you're here with me."],learned:[],about_me:[],handover:''});
  const generated=await A._engine.writeOne({orgId:'org',creatorId:'creator',model:'fixture/writer',base:{profile:records.ai_personas.profile,chat:[{from_fan:true,text:'hello'}],level:{max:0,his:0,mood:'chatty'},plan:{...makePlan('hello',{profile:{...profile,new_sub:true},herReplies:0}),new_today:true}},latest:['hello'],recentHer:[],voice:null,speed:'normal',emojis:'none'});
  assert.equal(generated.status,'ok');assert.ok(generated.style.some(x=>x.includes('subscribed today')));
  record('known_invented_history_still_accepted',{status:generated.status,drafts:generated.drafts,messages:generated.replies.map(x=>x.creator_message),style:generated.style});
  // The complete pipeline still selects the first-sale ask when selling is off.
  const dialogue=[];for(let i=0;i<12;i++){dialogue.push({from:'fan',text:`I enjoy painting and long walks number ${i}`},{from:'her',text:`I spent some time painting today number ${i}`});}
  dialogue.push({from:'fan',text:'I also enjoy drawing landscapes on weekends'});
  const off=await A.reply('org','creator',{madeUp:{name:'Synthetic fan',type:'new_sub'},test:dialogue,selling:false,planOnly:true});
  assert.equal(off.used.plan.goal,'direct_ask');assert.equal(off.used.plan.sell.allowed,false);
  record('selling_off_still_runs_sales_conversation',{selling:false,fanLevel:off.used.level.his,aim:off.used.session.aim,goal:off.used.plan.goal,goalText:off.used.plan.goal_text,allowedLevel:off.used.plan.level.max});
  // The same background with only the spending category changed changes intimacy.
  const unpaid=Mem.closenessOf({tier:'none',chat:[],card:[]});
  const paying=Mem.closenessOf({tier:'whale',chat:[],card:[]});
  assert.equal(unpaid.level,'new');assert.equal(paying.level,'friendly');
  record('money_changes_relationship_tone',{unpaid:{level:unpaid.level,tone:unpaid.tone},paying:{level:paying.level,tone:paying.tone}});
  const share='Painting helps me switch my brain off.';
  assert.equal(A._communicationAudit.SHARES.test(share),false);
  record('real_self_disclosure_not_recognized',{reply:share,recognized:A._communicationAudit.SHARES.test(share)});
  // An unanswered planned question is remembered even if every draft is blocked.
  process.env.ANTHROPIC_API_KEY='offline-fixture-not-a-key'; // The reader transport is stubbed above.
  Object.assign(reading,{doing:'sharing',new:'A new hobby with more than one possible angle',readings:[{what:'Painting miniatures as a hobby',sure:0.6},{what:'Painting for a competition',sure:0.4}],curious:'What kind of miniatures do you paint?',stance:'curious'});
  writerText=JSON.stringify({messages:['https://example.com'],learned:[],about_me:[],handover:''});
  const blocked=await A.reply('org','creator',{madeUp:{name:'Synthetic fan',type:'regular'},test:[{from:'her',text:'What do you enjoy doing?'},{from:'fan',text:'I spend my weekends painting miniatures'}],selling:false});
  assert.equal(blocked.used.plan.goal,'curious');assert.equal(blocked.results[0].status,'blocked');
  assert.ok(blocked.used.session.asked_about.includes(reading.curious));
  record('failed_draft_remembers_unasked_question',{goal:blocked.used.plan.goal,writerStatus:blocked.results[0].status,rememberedAsAsked:blocked.used.session.asked_about});
  // Old conversational origins are removed before reader and writer context is built.
  Object.assign(reading,{doing:'small_talk',new:'',readings:[],curious:'',stance:'steady'});
  writerText=JSON.stringify({messages:['That sounds nice to me.'],learned:[],about_me:[],handover:''});
  const history=[{from:'fan',text:'Our private joke is the ORIGAMI_PENGUIN club'},{from:'her',text:'I am the president of the ORIGAMI_PENGUIN club'}];
  for(let i=0;i<22;i++)history.push({from:'fan',text:`I had a nice walk today number ${i}`},{from:'her',text:`I like taking long walks too number ${i}`});
  history.push({from:'fan',text:'Your club president has returned'});
  calls=[];
  const forgetting=await A.reply('org','creator',{madeUp:{name:'Synthetic fan',type:'regular'},test:history,selling:false,learned:[]});
  const supplied=calls.map(c=>c.messages.map(x=>x.content).join('\n')).join('\n');
  assert.equal(supplied.includes('ORIGAMI_PENGUIN'),false);
  record('shared_joke_origin_missing_from_context',{messagesSupplied:history.length,messagesUsed:forgetting.used.messages,originVisibleToModels:supplied.includes('ORIGAMI_PENGUIN'),storySupplied:forgetting.used.story});
  const review=req('./server/src/ai/chat/review');
  await review.coachCheck({profile:{name:'Synthetic creator',personality:'PERSONA_MARKER: dry humour, dislikes small talk, never uses pet names'},chat:[],messages:['hello there']});
  const judgePrompt=JSON.stringify(reviewCalls.at(-1));
  assert.equal(judgePrompt.includes('PERSONA_MARKER'),false);
  record('coach_missing_character_personality',{personalityPresentInInput:true,personalityPresentInJudgePrompt:judgePrompt.includes('PERSONA_MARKER')});
  const schema=P.replyPrompt({profile:records.ai_personas.profile,chat:[{from_fan:true,text:'hello'}],plan:makePlan('hello')});
  record('prompt_size_for_simple_moment',{characters:schema.reduce((n,x)=>n+x.content.length,0),systemCharacters:schema[0].content.length});
  // Control: sincere topic detail can be supplied by the caller and survives ordinary cleanup.
  assert.deepEqual(P.tidyMessages(['I love painting landscapes.'],{emojis:'none'}),['I love painting landscapes.']);
  fs.writeFileSync(path.join(__dirname,'communication-results.json'),JSON.stringify(out,null,2)+'\n');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
