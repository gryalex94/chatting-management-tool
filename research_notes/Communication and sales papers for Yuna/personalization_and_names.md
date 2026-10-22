# Personalization, intrusiveness and the customer's name: two 2026 papers, mapped to Yuna

Research date: 22 October 2026. Scope: two papers only (Zobair et al. 2026 in *Journal of Retailing and Consumer Services*; Raja, Cheng and Danaher 2026 in *Journal of Retailing*), plus a few citing or neighbouring papers used only where they help interpret those two. Dialogue quality first, sales second. No legal or policy discussion. Nothing here is implemented; proposals are marked as proposals.

**Access note (read this first).** Both papers are published open access under a CC BY licence (confirmed by Crossref and OpenAlex), but the publisher site (ScienceDirect) refused every automated route available to me: the fetch tool (HTTP 403), curl with a browser user agent (403 bot wall), and the desktop app's built-in browser pane (Elsevier's "CPE00001" block page, keyed on the browser's user agent). The user's Chrome extension was not connected. Elsevier's text-mining endpoint needs an API key (401). No repository copy exists (OpenAlex: `any_repository_has_fulltext: false` for both; Nottingham Trent's IRep has no record; the Monash portal links only to the DOI). The Internet Archive's Scholar search sits behind an "I'm not a robot" check, which I did not attempt to pass; its fatcat catalogue and OpenAIRE's API were unreachable at the time. Consequences:

- **Paper 1 (Zobair et al.)**: everything below comes from the verbatim abstract, the metadata records and citing-work lists. I did not see the method, the message wording, the scales or any effect size. Where the brief asked for these, the answer is "not retrievable; see Gaps".
- **Paper 2 (Raja, Cheng, Danaher)**: the abstract is verbatim; the numbers come from two secondary sources that read the full paper: a ScienceSays research summary and the first author's own LinkedIn post (seen through a search snippet). The two agree on the headline figures. Operational details (how "overuse" was counted, exact scenario texts, mediation coefficients) are not confirmed from the paper itself.

A reader who later opens either PDF (a manual visit to the ScienceDirect page will show the full text, since both are CC BY) should be able to fill the Gaps sections quickly; the page URLs are given in each section.

---

## 1. Paper 1 — Zobair et al. 2026, "When AI advice backfires" (JRCS): what does it show, and what does it not show?

### Takeaway
A multi-method study (46 interviews, then a randomized field experiment with 409 US retail consumers whose purchases were read from transaction data) found that personalized AI recommendation messages raised purchase likelihood relative to humorous ones, through two opposing paths: a stronger sense that the AI was trying to help (which raised buying) and a stronger sense of intrusiveness (which pulled it down). Shopping urgency amplified both paths; a stronger customer-retailer relationship strengthened the helpful path and weakened the intrusive one. Only the abstract and metadata were accessible; the message wording, the scales and all effect sizes are unknown.

### Cited Findings

**Bibliographic facts**
- Title: "When AI advice backfires: Field experimental evidence on personalization, intrusiveness, and purchase behavior"; *Journal of Retailing and Consumer Services*, volume 92, article 104844; DOI 10.1016/j.jretconser.2026.104844; record created 27 April 2026; print issue June 2026; licence CC BY 4.0 effective 20 April 2026; copyright "© 2026 The Authors. Published by Elsevier Ltd." — [Crossref](https://api.crossref.org/works/10.1016/j.jretconser.2026.104844)
- Authors and affiliations: Alwia Saeed Osman Zobair (corresponding; Imam Mohammad ibn Saud Islamic University, Saudi Arabia), Zainab Mohammed Osman Kodai (same), Mohammed Abdulaziz Almansour (same), Salwa Dirar Awad Mohammed (King Khalid University, Saudi Arabia), Gomaa Agag (corresponding; Nottingham Trent University, UK), Osman Alipour (Islamic Azad University, Tehran, Sardasht Branch, Iran). Open access, hybrid, CC-BY, published version; 34 referenced works; cited by 10 at the time of the OpenAlex snapshot — [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844)
- Keywords: "Artificial intelligence communication; Personalization; Perceived helpfulness attribution; Perceived intrusiveness; Retail purchase behavior; Field experiment". EconPapers lists no working-paper version — [EconPapers](https://econpapers.repec.org/article/eeejoreco/v_3a92_3ay_3a2026_3ai_3ac_3as0969698926001256.htm)
- Publisher page (full text, CC BY, blocked to automated access): [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0969698926001256)

**Abstract, verbatim** (reconstructed word-for-word from OpenAlex's inverted index; fragment boundaries are mine) — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- "As conversational artificial intelligence (AI) systems increasingly serve as frontline interfaces in retail, understanding how specific AI recommendation message styles shape consumer behavior has become a central concern."
- "This study examines two alternative AI recommendation response styles - personalized and humorous message framing - and identifies the psychological mechanisms through which these styles influence purchasing decisions."
- "Drawing on persuasion theory and the heuristic-systematic model, we propose a parallel dual-pathway framework in which response style affects purchase behavior through perceived helpfulness attribution and perceived intrusiveness, with shopping goal urgency and customer-retailer relationship strength acting as key boundary conditions."
- "We employ a multi-method research design consisting of an exploratory qualitative study (46 semi-structured interviews) and a randomized field experiment conducted in a U.S. retail context (N = 409), in which purchase behavior is measured using secondary transaction data."
- "The results show that personalized AI communication significantly increases the likelihood of purchase relative to humorous communication. This effect is driven by stronger attributions of helping intent, but is partially offset by heightened perceptions of intrusiveness, revealing personalized message framing as a double-edged strategy."
- "Further analyses indicate that urgency amplifies both pathways, whereas stronger customer-retailer relationships enhance helpfulness attribution and attenuate intrusiveness concerns."
- "Robustness checks confirm the stability of the findings across alternative specifications and outcome operationalizations. Overall, this study advances theory on human-AI interaction by linking AI recommendation message framing to observed consumer behavior, clarifying when personalization enhances or undermines behavioral effectiveness."

**Design facts that the abstract pins down**
- Two message styles are compared: "personalized" and "humorous" framing of an AI recommendation. The abstract names no neutral or no-message control group — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- The two mechanisms are "perceived helpfulness attribution" (reading the message as an attempt to help) and "perceived intrusiveness"; the two moderators are "shopping goal urgency" and "customer-retailer relationship strength" — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- The outcome is actual purchase ("likelihood of purchase"), measured from "secondary transaction data", with "alternative ... outcome operationalizations" used in robustness checks — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Citing works indexed so far (8 listed) include "When AI shops for me: How agentic retail representation turns assistance into purchase delegation" (JRCS), "When AI disclosure makes charities seem less communal" (JRCS), "Brand relationships in conversation: a review of conversational agents" (JPBM) and a hospitality field experiment on AI guilt appeals; none that I could open describes this paper's conditions — [Semantic Scholar](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1016/j.jretconser.2026.104844?fields=title,abstract,authors,openAccessPdf,tldr,year,venue,citationCount,citations.title,citations.externalIds); the JPBM review's visible abstract does not mention the paper — [Emerald](https://www.emerald.com/insight/content/doi/10.1108/JPBM-02-2025-5785/full/html)
- No Altmetric record exists for this DOI (404) — [Altmetric](https://www.altmetric.com/details/doi/10.1016/j.jretconser.2026.104844)

### Inferences
- The comparison is personalized versus humorous, not personalized versus neutral. "Personalized beat humorous" therefore does not tell us whether personalization beats a plain message or whether humour is below a plain message.
- "Double-edged" here is a within-condition statement: the same personalized message produced both the helpful reading and the intrusive reading at once; the net was positive on purchases because the helpful path outweighed the intrusive path in this sample.
- The relationship moderator works on both paths in the favourable direction (more helpful, less intrusive), which means the net benefit of personalization should be largest for customers who already know and trust the sender and smallest (possibly negative, though the abstract does not say so) for strangers.
- Because the robustness section mentions alternative outcome operationalizations, the paper probably reports more than one purchase measure (for example purchase incidence and a spend measure), but this is a guess from the abstract's wording.

### Gaps (not retrievable without the full text)
- The exact wording of the "personalized" and "humorous" messages, what the personalization was based on (past purchases, stated preferences, browsing), and whether any neutral baseline existed.
- The channel: whether the AI messages came through a chatbot, an app notification, email or SMS, and whether the sender was labelled as AI.
- The retailer type, the product category, and how 409 customers were randomized and linked to transaction data.
- How helpfulness attribution and intrusiveness were measured (scale items, sources, when the survey was taken relative to the purchase).
- All effect sizes: the purchase-likelihood difference between conditions, the indirect effects through each path, and the interaction terms for urgency and relationship strength.
- How relationship strength and urgency were measured (self-report versus loyalty records).
- What the 46 interviews contributed (the abstract says only that they were an "exploratory qualitative study").

---

## 2. Paper 2 — Raja, Cheng and Danaher 2026, "Call me by my name" (Journal of Retailing): what does it show, and what does it not show?

### Takeaway
A 2022 field experiment in a suburban restaurant in a major Australian city (127 tables, per the summary) plus three online experiments show that an employee addressing a customer by name raised satisfaction, upsell acceptance (22.6% to 48.4%) and spend per person (+17.3%), that the gain disappears when the name is placed right next to the upsell, that moderate frequency helps (+9.1% satisfaction for "every other sentence") while "every sentence" cancels the gain, and that embarrassing contexts reverse it; rapport carries the gains and discomfort carries the losses. Numbers are from secondary summaries that read the full paper, not from the paper itself.

### Cited Findings

**Bibliographic facts**
- Title: "Call me by my name: the effects of addressing customers by their names, the underlying mechanisms, and the boundary conditions"; authors Sri Vishnu Srinivasa Raja, Yimin Cheng, Tracey S. Danaher (Department of Marketing, Monash University); *Journal of Retailing* (ISSN 0022-4359), accepted/in press 2026, 17 pages; DOI 10.1016/j.jretai.2026.03.008; CC BY; keywords "Discomfort; Frontline employees; Name; Personalization; Rapport; Service interactions"; 1 Scopus citation at capture — [Monash research portal](https://research.monash.edu/en/publications/call-me-by-my-name-the-effects-of-addressing-customers-by-their-n/)
- OpenAlex: publication date 1 April 2026; open access, hybrid, CC-BY, published version; no repository full text; cited by 2 (the chatbot paper "Hello, [Your Name]" and a methods paper on moderation in marketing research) — [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1016/j.jretai.2026.03.008); [Semantic Scholar](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1016/j.jretai.2026.03.008?fields=title,abstract,authors,openAccessPdf,tldr,year,venue,citationCount,citations.title,citations.externalIds)
- Publisher page (full text, CC BY, blocked to automated access): [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0022435926000278)
- Attention: Altmetric score 2 (3 X users, 1 Facebook page, 3 Mendeley readers; last calculated 21 July 2026) — [Altmetric](https://www.altmetric.com/details/doi/10.1016/j.jretai.2026.03.008)
- The first author's PhD page lists the paper with no PDF or preprint; his research interests include "Service Personalization" and consumer responses to AI — [Sri Vishnu Srinivasa Raja, PhD page](https://sites.google.com/monash.edu/srivishnuphd/home)

**Abstract, verbatim** (from OpenAlex's inverted index; fragments are mine) — [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1016/j.jretai.2026.03.008)
- "Addressing customers by name is widely promoted as a best practice in frontline service, yet its true impact on customer experiences, the psychological mechanisms underlying it, and boundary conditions remain insufficiently understood."
- "Using a real-world field experiment capturing actual sales and upselling behavior and three online experiments, we systematically examine employee-initiated name usage as a frontline interpersonal influence tactic, its key linguistic (frequency, placement) and contextual (neutral vs. embarrassing) boundary conditions, and the psychological processes that may underlie its effects."
- "Our findings reveal a clear duality: while employees addressing customers by name can enhance customer satisfaction and drive upselling effectiveness, this same practice can diminish satisfaction when overused, misused, or applied in embarrassing contexts."
- "Further, a dual-process mechanism emerges: rapport explains when name usage improves outcomes, whereas discomfort explains when it backfires."
- "Taken together, this research offers new insights into the dynamics of name-based personalization in service, conceptualizing employee-initiated name usage as a specific personalization-based influence tactic that carries both interpersonal benefits and potential unintended negative consequences for firms."

**Field experiment (secondary sources)**
- Setting: "suburban Australian restaurant, 127 tables"; average spending per person rose 17.3%, from $28.67 to $33.64; upsell acceptance went from 22.6% to 48.4%; customer satisfaction was 15.9% higher — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Search-engine rendering of the publisher page: the field study "was conducted in 2022 at a suburban restaurant in a major Australian city", "measured satisfaction, upselling effectiveness, and sales per customer, and examined whether mutual name usage had an even superior effect" (wording as surfaced by the search tool from the ScienceDirect page; not read directly) — [ScienceDirect page via search snippet](https://www.sciencedirect.com/science/article/pii/S0022435926000278)
- The first author's LinkedIn post describes "four experiments in restaurant and online customer service settings"; with name use "average spending per person rose 17.3%, upsell offers were accepted more than twice as often, and satisfaction was 15.9% higher"; "forced or awkward name use undermines these benefits" (seen as a search snippet of a promotional post, not the paper) — [LinkedIn profile](https://www.linkedin.com/in/sri-vishnu-srinivasa-raja-8664101a3/)
- Mutual names: "Employees who introduce themselves by name first strengthen the effect" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name); a search summary states the effects "were strongest when both the employee's and the customer's names were used" — [search summary of the publisher and ScienceSays pages](https://www.sciencedirect.com/science/article/pii/S0022435926000278)

**Placement (online experiment)**
- "Customers were 17.2% more likely to accept an upsell request when their name was randomly used during the conversation with a waitress, compared with no use of their name. The effect disappeared when the name was used immediately alongside the upsell offer." — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)

**Frequency / overuse (online experiment)**
- "Compared with no name use, using the name in every other sentence increased satisfaction by 9.1%. Using it in every sentence cancelled that benefit and caused discomfort." The summary gives no count per interaction beyond these two patterns — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- The search-engine rendering of the publisher page says an online study "tested a curvilinear effect of name usage frequency and the mediating roles of rapport and discomfort" — [ScienceDirect page via search snippet](https://www.sciencedirect.com/science/article/pii/S0022435926000278)

**Embarrassing context (online experiment)**
- "The effect reverses when the name is used in an embarrassing situation, such as a pharmacy purchase of hemorrhoid cream. Using the name when the customer prefers privacy, such as buying STD medication, also causes discomfort and cancels the benefits." — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)

**Mechanisms**
- Rapport: "Hearing their name makes customers feel valued as people rather than as revenue, which builds rapport with the employee and makes them more receptive to suggestions." Discomfort: "When the name feels forced, unnatural, or used to sell, rapport breaks. Use in embarrassing situations also creates discomfort." — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Abstract: "rapport explains when name usage improves outcomes, whereas discomfort explains when it backfires" — [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1016/j.jretai.2026.03.008)

**Samples, caveats and practical advice as summarized**
- Countries sampled: United States, United Kingdom and Australia; caveats: formality norms may differ in other cultures; the study "didn't separate first names from titled family names (e.g., 'Mr. Smith')"; "Effects on repeat or regular customers are unknown"; "Online support chats weren't tested directly" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Practical takeaways listed: use names naturally in conversation; avoid scripted or repetitive use; avoid names in embarrassing or private situations; introduce yourself by name first; test on a small scale before rollout — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)

**Neighbouring evidence used for interpretation only**
- An earlier restaurant field study: "Food servers received a 6% increase in tips when they invited introductions and addressed customers by name than when they did not" (Seiter, Givens and Weger, *Journal of Hospitality Marketing & Management* 25(5)) — [Taylor & Francis abstract via search snippet](https://www.tandfonline.com/doi/abs/10.1080/19368623.2015.1040140)
- A 2026 chatbot paper that cites Raja et al.: "Across five experimental studies, we demonstrate that name-based personalization within chatbot messages enhance perceptions of chatbot sincerity and brand sincerity, leading to more favorable consumer attitudes and higher purchase intentions toward the brand. The effect of personalization on perceived chatbot sincerity is mediated via perceived anthropomorphism. Further, we identify a few boundary conditions ... namely chatbot performance and perceived overuse of name-based personalization." (Lee, Pontes, Khan and Phạm, *Psychology & Marketing*, 2026; abstract only, full text behind a Cloudflare check) — [Semantic Scholar record](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/mar.70251?fields=title,abstract,authors,year,venue,tldr,openAccessPdf)

### Inferences
- The two secondary sources (ScienceSays and the first author's post) agree on the three headline field numbers (+17.3% spend, upsell more than doubled, +15.9% satisfaction), so these are probably accurate, but "127 tables" is the unit count reported by one summary and may be tables rather than customers; the per-condition split is unknown.
- "Every other sentence" versus "every sentence" is almost certainly the online manipulation of frequency, which means the paper's unit for "overuse" is per sentence within one scripted service exchange, not per message or per day. A rule stated in "replies" (as Yuna's is) cannot be read off the paper without the scripts.
- The placement result is the most practically distinctive finding: a name right beside the ask reads as a selling device and loses the rapport benefit, while the same name elsewhere in the conversation keeps it. The mechanism language ("used to sell" breaks rapport) supports this reading.
- The "embarrassing" manipulation is about exposure and privacy in a semi-public service encounter (pharmacy counter). The construct is "being identified while exposed", not "intimate content as such".
- The ScienceSays caveat "online support chats weren't tested directly" and the author's "online customer service settings" are compatible if the online experiments were written scenarios of service exchanges rather than live chats; I could not confirm which.

### Gaps (not retrievable without the full text)
- Sample sizes of the three online experiments and the exact scripts (how many name mentions in the "every other sentence" and "every sentence" conditions; what the "randomly during the conversation" placement looked like; the upsell wording).
- Per-condition means and tests for the field experiment (no-name versus customer-name versus mutual-name), the number of customers per arm, and how satisfaction was collected at the table.
- The mediation statistics (indirect effects through rapport and discomfort; the scale items and their sources).
- Whether a "misused" name (the abstract's third failure mode) means a wrong name, a name used at the wrong moment, or a name used to sell; the summaries do not define it.
- Whether the paper measured relationship history (regulars versus first-time guests); one summary says effects on repeat customers are unknown.

---

## 3. Personalized versus humorous versus neutral: what did the messages say, what drove the purchase difference, what made a message feel intrusive, and did intrusiveness depend on how well the customer knew the brand?

### Takeaway
The message texts are not available; the abstract establishes only that a personalized framing of an AI recommendation outsold a humorous framing because it was read more strongly as an attempt to help, while also being read as more intrusive, and that a stronger existing relationship with the retailer both strengthened the helpful reading and weakened the intrusive one. There is no neutral baseline in the abstract.

### Cited Findings
- The compared styles are "personalized and humorous message framing" of "AI recommendation" messages from "conversational artificial intelligence (AI) systems" serving as "frontline interfaces in retail" — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Driver of the difference: "stronger attributions of helping intent", "partially offset by heightened perceptions of intrusiveness" — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Relationship: "stronger customer-retailer relationships enhance helpfulness attribution and attenuate intrusiveness concerns"; urgency: "amplifies both pathways" — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Theoretical lens: "persuasion theory and the heuristic-systematic model" with a "parallel dual-pathway framework" — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Neighbouring evidence on what makes personalization intrusive: in a separate 2025 study, when situational privacy concern was activated, "highly intrusive, PII-based personalization was no more effective than a generic message" (search snippet; not one of the two papers) — [PMC12561546 via search snippet](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12561546/)
- Neighbouring evidence on AI personalization and early pushback: in a longitudinal study of personalized language models, "Immediately after the first session, participants in both personalised conditions reported lower advice uptake than those in the control condition. This early aversion may reflect a reactance effect" (search snippet; not one of the two papers) — [arXiv 2609.20077 via search snippet](https://arxiv.org/pdf/2609.20077)

### Inferences
- The purchase difference is best read as "the personalized message answered the question 'why is this being recommended to me?' with 'because it fits you', which the customer took as help". The humorous message presumably did not answer that question as clearly. This is an inference from the mechanism named in the abstract, not from the message texts.
- What made the personalized message intrusive is, by the paper's own framing, the same thing that made it helpful: it revealed that the system knew something about the customer. The paper's remedy is not "personalize less" but "be in a position where the customer reads knowledge as care", which the relationship moderator provides.
- Whether intrusiveness depended on brand familiarity: yes, in the direction that a closer relationship lowered it. The abstract does not say whether intrusiveness ever outweighed helpfulness for weak-relationship customers (that is, whether the net effect flipped negative for strangers).

### Gaps
- No message wording, no neutral condition, no effect sizes, no scale items (see Section 1 Gaps).
- Whether "personalized" meant naming the customer, citing past purchases, citing stated preferences, or some mix; this matters for everything in Sections 4 and 5 and is unknown.

---

## 4. Grounding an offer in what he explicitly said he likes without it feeling like surveillance: is there evidence on referencing remembered details tactfully?

### Takeaway
Neither paper tests an "I remember you said..." line. What they offer is indirect: Paper 1's mechanism (knowledge read as care versus as intrusion, with relationship strength tipping the balance) and Paper 2's placement result (a personal touch bolted directly onto the ask loses its benefit). The tactful-reference evidence must be built from these by analogy and should be treated as a hypothesis to test on Yuna's own logs.

### Cited Findings
- Personalized framing is "double-edged": helpful attribution and intrusiveness rise together; relationship strength raises the first and lowers the second — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- The name's upsell benefit held when the name was used "randomly ... during the conversation" and "disappeared when the name was used immediately alongside the upsell offer" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Rapport breaks "when the name feels forced, unnatural, or used to sell" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Privacy concern, once activated, removed the advantage of personally-identifying personalization over a generic message (neighbouring study, search snippet) — [PMC12561546 via search snippet](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12561546/)
- Chatbot name personalization raised perceived sincerity via anthropomorphism, bounded by "perceived overuse" (neighbouring study, abstract) — [Semantic Scholar record for Lee et al. 2026](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/mar.70251?fields=title,abstract,authors,year,venue,tldr,openAccessPdf)

### Inferences
- The surveillance feeling is the intrusiveness path of Paper 1. By the paper's logic, it is weakest when (a) the detail was given to her directly by him (so "she listened" is the natural attribution rather than "she tracked"), and (b) the relationship is already warm. Details he volunteered in conversation are the safest ground; details he never told her (a purchase record recited back, a pattern she noticed) are the riskiest.
- By analogy with the placement result, a remembered detail works better as part of the conversation than as the justification glued to the offer line. Concretely: the callback belongs a turn or two before the tease, in her own voice, and the tease then follows without restating the callback as a reason to buy. This is an extrapolation from names to memory callbacks; the paper did not test callbacks.
- "Used to sell" is the phrase to design against: a callback that appears only when she is about to sell will, over several conversations, be learned as a sales cue and lose its rapport value. Callbacks that also appear in non-selling turns keep their meaning.
- The neighbouring privacy-concern result suggests that any wording that reminds him that she keeps records ("I see that you bought...", "according to my notes") activates the concern and can wipe out the gain; wording that reflects his own words ("you said you were into...") does not carry that reminder. This is an inference from a snippet of a different study.

### Gaps
- No study here measures the effect of referencing a remembered detail versus not, nor compares phrasings of such references.
- No evidence on how long after a disclosure a callback stays welcome, or whether callbacks to earlier conversations (as opposed to the current one) are read differently.

---

## 5. Names: how often is too often, what contexts made a name feel wrong, and what does this say for Yuna's name rule and for pet names?

### Takeaway
In the Monash online experiments, a name in "every other sentence" improved satisfaction by 9.1% over no name while a name in "every sentence" cancelled the benefit; a name placed right beside the upsell lost its effect; and a name used in an embarrassing or privacy-sensitive context reversed or cancelled the benefit. Yuna's current rule (skip the name when it appeared in her last few replies) is in the direction the inverted-U supports; the placement and context findings suggest two additional rules. Pet names are not studied in either paper, so anything about "babe" is an extrapolation.

### Cited Findings
- Frequency: "using the name in every other sentence increased satisfaction by 9.1%"; "Using it in every sentence cancelled that benefit and caused discomfort" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name); the design tested "a curvilinear effect of name usage frequency" — [ScienceDirect page via search snippet](https://www.sciencedirect.com/science/article/pii/S0022435926000278)
- Placement: +17.2% upsell acceptance with the name "randomly used during the conversation", no effect "immediately alongside the upsell offer" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Context: reversal for a "pharmacy purchase of hemorrhoid cream"; discomfort and cancelled benefits when the customer "prefers privacy, such as buying STD medication" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Abstract's three failure modes: "overused, misused, or applied in embarrassing contexts" — [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1016/j.jretai.2026.03.008)
- Mutual names strengthen the effect; staff should "use customers' names naturally in conversation" and "Avoid scripted or repetitive use" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Chatbot evidence: name-based personalization by a chatbot raised perceived sincerity and purchase intention, with "perceived overuse of name-based personalization" as a boundary condition (abstract) — [Semantic Scholar record for Lee et al. 2026](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/mar.70251?fields=title,abstract,authors,year,venue,tldr,openAccessPdf)
- The study did not separate first names from titled family names — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)

### Inferences
- "How often is too often": the only calibrated points are "every other sentence = good" and "every sentence = too much" within one short scripted exchange. Translated loosely to chat, a name in roughly every second message is already at the top of the tested range, and a name in consecutive messages is the tested failure case. Yuna's "left out when used in her last few replies" is at or below that ceiling, so the papers give no reason to loosen it. Whether a lower rate (one in four or five replies) is better or worse than one in two is untested.
- Contexts that made a name wrong were (a) next to the ask and (b) while the customer was exposed or wanted privacy. The chat analogues are: the offer or price message itself; and moments where he has just admitted something he flagged as private, declined for money reasons, apologized, or where a named address would make him feel seen at an awkward moment. These analogues are extrapolations from a public pharmacy counter to a private DM, where the third-party exposure that drives embarrassment is absent; the "feels forced or used to sell" discomfort route is the one most likely to carry over.
- "Misused" is undefined in the sources. The safest reading for Yuna is "a name that is wrong, mis-spelled, or not the name he goes by", which in Fanvue often means a handle rather than a real name; a handle spoken as if it were a first name may land as "scripted" rather than warm.
- Pet names ("babe"): the rapport mechanism in Paper 2 is individuation (he feels recognized as a person, not as revenue). A pet name is the opposite of individuating; it signals a closeness level, not recognition. So Paper 2's positive effect does not transfer to pet names at all. Its negative modes might (repetition reads as scripted; "babe" next to the price reads as a selling device), but that is reasoning by analogy, not evidence. The existing cap (none in the first three replies to a new fan; at most one in five afterwards) is therefore unsupported but also uncontradicted by these papers.
- The mutual-name finding has no direct analogue, since fans already know her name. The closest analogue is reciprocity: when she uses his name, she also gives something of herself (a detail, a feeling). Extrapolation.

### Gaps
- The paper's exact counts per interaction, scripts and the "misused" definition.
- No evidence at all on pet names, on names in written chat specifically (the chatbot paper measures intentions, not purchases, and its details are unread), or on names in intimate or sexual conversation.

---

## 6. Relationship strength as a moderator: does a closer relationship make personal references and names safer or riskier?

### Takeaway
For personalization generally, Paper 1 says closer is safer: a stronger customer-retailer relationship raised the helpful reading and lowered the intrusive one. For names, Paper 2 (as far as accessible) did not test relationship strength, and one summary says effects on repeat customers are unknown.

### Cited Findings
- "stronger customer-retailer relationships enhance helpfulness attribution and attenuate intrusiveness concerns" — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- "Effects on repeat or regular customers are unknown" for the name paper — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Urgency "amplifies both pathways", that is, a hurried customer finds the personalized message both more helpful and more intrusive — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)

### Inferences
- The direction supports tying the depth of personalization to the closeness level: a new fan gets personalization drawn only from the current conversation; a friendly or flirty fan can get callbacks to earlier talks; an intimate or girlfriend-level fan can get taste-based picks framed as knowing him. This is a mapping from "customer-retailer relationship strength" (familiarity and trust with a brand) to interpersonal closeness, which is a different construct; it is a proposal, not a finding.
- "Closer is safer" is about intrusiveness, not about frequency. Nothing in Paper 1 says a close customer tolerates more personal references per message; and Paper 2's overuse ceiling was found in one-off encounters, so whether regulars tolerate more name use is unknown.
- Urgency has no clean analogue in a chat; the nearest ("he wants something now") is speculative and should not be used to justify heavier personalization.

### Gaps
- No interaction sizes for relationship strength; no test of relationship strength on name effects; no data on long-running one-to-one relationships in either paper.

---

## 7. What does not transfer from retail email or store settings to a one-to-one flirtatious chat?

### Takeaway
Paper 1 is a one-shot AI recommendation to US retail customers with a humorous comparator and a shopping-urgency moderator; Paper 2 is spoken name use by restaurant and pharmacy staff in a public setting, with scenario-based online follow-ups. Neither involves a continuing one-to-one relationship, written intimacy, a sender who is the product, or a fan whose "name" may be a handle.

### Cited Findings
- Paper 1 context: "conversational artificial intelligence (AI) systems ... as frontline interfaces in retail"; "a U.S. retail context (N = 409)"; outcome "measured using secondary transaction data" — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Paper 2 context: a 2022 field study at "a suburban restaurant in a major Australian city" — [ScienceDirect page via search snippet](https://www.sciencedirect.com/science/article/pii/S0022435926000278); online experiments with a waitress scenario and pharmacy scenarios; US, UK and Australian samples; "Online support chats weren't tested directly" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Paper 2 frames name use as an "employee-initiated ... frontline interpersonal influence tactic" — [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1016/j.jretai.2026.03.008)
- The chatbot name study measured attitudes and purchase intentions, not purchases — [Semantic Scholar record for Lee et al. 2026](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/mar.70251?fields=title,abstract,authors,year,venue,tldr,openAccessPdf)

### Inferences
- Spoken versus typed: a typed name is visible, re-readable and easy to count; the "every sentence" overuse threshold may be lower in text because repetition is more conspicuous on screen. Untested.
- Public versus private: the embarrassment mechanism in Paper 2 needs an audience or a privacy-sensitive purchase at a counter; in a private DM the audience is absent, so the embarrassing-context result should be used only for its "discomfort when identified at an awkward moment" core, not for sexual content as such, which he chose and expects.
- Sender identity: in Paper 2 the employee is not the product; in Paper 1 the AI is a store's recommender. Yuna is both the relationship and the thing sold, so "helpful intent" and "selling intent" are harder for the fan to separate; the intrusiveness path may be stronger by default, and the rapport path may be stronger too. Direction unknown.
- One-shot versus ongoing: both papers measure single encounters. Effects of repeated name use or repeated callbacks over weeks are not covered (one summary explicitly says repeat customers are unknown).
- Humour: Paper 1's humorous condition is a message framing for a recommendation, not a personality trait of the sender. "Personalized beat humorous" says nothing about whether a warm, funny persona sells less; it says a joke-framed recommendation converted less than a fit-framed one in that experiment.
- Names on Fanvue may be handles or display names; the papers used real names learned through introduction.

### Gaps
- No study of names or personalization in creator-fan chat, in sexual or romantic conversation, or with purchases of digital content.

---

## 8. What Yuna could use (proposals; none implemented)

### Takeaway
The strongest transferable ideas are: keep the name out of the offer message itself; keep names and callbacks appearing in non-selling turns so they never become a sales cue; ground any "fits you" line in what he told her, in his words, not in records; and let closeness level set how deep personalization goes. Every item below is a proposal built on abstract-level or secondary-sourced findings and should be A/B tested on Yuna's own logs before being trusted.

### Cited Findings
- Placement: name next to the upsell removed the +17.2% acceptance gain — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Frequency: every other sentence +9.1% satisfaction; every sentence cancelled it — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Mechanism: rapport when valued "as people rather than as revenue"; discomfort when "forced, unnatural, or used to sell" — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- Personalization's purchase gain runs through "attributions of helping intent" and is offset by "intrusiveness"; relationship strength improves both — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Practical advice from the name paper's summary: natural use, no scripted repetition, none in private or embarrassing moments, introduce yourself, test small first — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)

### Inferences (proposals, with the engine context from the brief of 22 Oct 2026)
- **Proposal A, name placement rule.** Add to the existing name rule: no name in the message that teases or prices a PPV piece, and none in the message right after a decline. Names live in the conversational turns. Basis: Paper 2 placement result (secondary source). Expected effect: protects the rapport value of the name; costs nothing in sales per the paper, since the beside-the-ask name added nothing.
- **Proposal B, keep the current frequency rule, state it as a ceiling.** "Left out when used in her last few replies" already keeps her under the tested failure case (consecutive use). The papers do not justify loosening it; the only open question is whether even rarer use is better, which a log test could answer. Basis: inverted-U frequency result (secondary source).
- **Proposal C, no name at exposed moments.** Skip his name for one or two turns after he discloses something he marked as private or shameful, after a money-related decline, and while he is apologizing. Basis: embarrassing-context result, extrapolated from a public counter to a private DM (weaker analogy; the "feels forced" route is the part most likely to carry).
- **Proposal D, callbacks are not sales cues.** Make the memory layer surface callbacks in non-selling turns at least as often as in selling turns, so a callback is not learned as "here comes the pitch". Basis: Paper 2's "used to sell" discomfort route plus the placement result, extrapolated from names to remembered details.
- **Proposal E, ground "his taste" in his words.** When the plan says a piece fits him, the writer should justify it only with things he said or asked for in chat (and phrase them as his words), never with purchase records or inferred patterns he did not voice ("I noticed you always buy...", "my notes say..."). Basis: Paper 1's helpfulness-versus-intrusiveness mechanism (abstract only) plus the neighbouring privacy-concern finding (snippet).
- **Proposal F, depth of personalization by closeness level.** New: only the current conversation. Friendly and flirty: callbacks to earlier conversations allowed, one per exchange. Intimate and girlfriend: taste-based picks framed as knowing him. Basis: Paper 1's relationship moderator, mapped from brand relationship to interpersonal closeness (a different construct; proposal only).
- **Proposal G, fit-framed offers, humour kept for the conversation.** Where the plan has a choice between a joke-wrapped tease and a plain "this is the one you asked for" tease, prefer the fit-framed one, and keep humour in the turns around it. Basis: personalized beat humorous on purchases (abstract only; no neutral baseline; the humorous condition was a recommendation framing, not a persona trait).
- **Proposal H, reciprocity when she uses his name.** Pair a named address with a small self-disclosure of her own. Basis: the mutual-name finding (employee introduces self), extrapolated; Yuna's name is already known, so the analogy is loose.
- **Proposal I, measure it.** From Yuna's logs, compare PPV acceptance and the next-turn sentiment for offers (1) with versus without his name in the offer message, (2) with a name in the preceding three turns versus none, and (3) with a callback in the offer versus a callback two turns earlier. This reproduces the placement and frequency tests in the real setting instead of trusting restaurant numbers. Basis: the summary's own advice to test on a small scale before rollout.
- **Alignment note, not evidence.** The existing rules "no second attempt after a decline in the same conversation" and "pause after a big spend" are consistent with Paper 1's intrusiveness path (pressing after a refusal is the clearest way to be read as selling rather than helping), but neither paper tests declines or spend pauses.

### Gaps
- None of the proposals has a measured effect size behind it in this setting; the numbers quoted are from a restaurant (secondary) and an unknown-retailer AI message (abstract).
- Pet-name proposals are deliberately absent: no evidence.

---

## 9. What not to infer

### Takeaway
The papers support directional rules about placement, repetition and context, and a general "knowledge reads as care only inside a relationship" principle. They do not support claims about magnitudes in chat, about pet names, about intimate content, about "I remember" lines, or about humour being harmful.

### Cited Findings
- Paper 1 compares "personalized and humorous" framings only; no neutral baseline is named — [OpenAlex abstract record](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844?select=title,abstract_inverted_index,publication_date,biblio)
- Paper 1 effect sizes, message texts and scales were not accessible (open access but blocked to automated reading) — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0969698926001256); no repository copy — [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1016/j.jretconser.2026.104844); [NTU IRep search, no match](https://irep.ntu.ac.uk/cgi/search/simple?q=%22advice+backfires%22+Agag&_action_search=Search)
- Paper 2 numbers come from a summary service and the author's promotional post, not from the paper — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name); [LinkedIn profile](https://www.linkedin.com/in/sri-vishnu-srinivasa-raja-8664101a3/)
- Paper 2 did not separate first names from titled family names, did not test repeat customers, and did not test online support chats directly — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- The embarrassing contexts were health-privacy purchases at a pharmacy — [ScienceSays summary](https://app.sciencesays.com/p/when-and-how-to-call-customers-by-name)
- The chatbot name paper reports purchase intentions, not purchases, and its boundary condition is "perceived overuse", not a count — [Semantic Scholar record for Lee et al. 2026](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/mar.70251?fields=title,abstract,authors,year,venue,tldr,openAccessPdf)

### Inferences (things the notes should not be read as saying)
- Do not infer that personalization beats a plain message, or that humour hurts sales; only "personalized beat humorous" is established, and only in that experiment.
- Do not quote a size for Paper 1's effects; none was accessible. "Significantly increases" is all the abstract gives.
- Do not treat "17.3%", "22.6% to 48.4%", "+9.1%", "+17.2%" or "15.9%" as verified from the paper; they are consistent across two secondary sources but unconfirmed, and the per-condition counts are unknown.
- Do not convert "every other sentence" into a per-reply rule for chat; the unit was sentences inside one scripted exchange, and the chat threshold may be lower because typed repetition is more visible.
- Do not apply the embarrassing-context reversal to sexual content in a private chat he initiated; the construct was exposure or health privacy at a public counter. Apply only the narrower "identified at an awkward moment" idea, and as a proposal.
- Do not extend any positive name effect to pet names; the mechanism (being recognized as an individual) does not apply to "babe". Only the negative modes (scripted repetition, next-to-the-ask placement) are plausibly shared, and that is by analogy.
- Do not infer that a closer relationship permits more frequent names; Paper 1's moderator concerns intrusiveness of personalization, and Paper 2 did not test relationship history.
- Do not infer that "I remember you said..." has been tested; nothing here studies callbacks to remembered details.
- Do not treat the Fanvue fan's handle as equivalent to the real names used in the study.
- Do not read "shopping goal urgency" as "he is aroused now"; the construct is a time-pressured shopping goal in retail, and the paper's finding (urgency raises both help and intrusion) gives no licence for heavier personalization under any chat analogue.
- Do not assume the AI messages in Paper 1 were disclosed as AI, or were not; the channel and disclosure are unknown, and the helpful-intent attribution may differ when the sender is perceived as a person.

### Gaps
- Everything in the Gaps of Sections 1 and 2 remains open until someone opens the two CC BY PDFs by hand: [Paper 1 on ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0969698926001256); [Paper 2 on ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0022435926000278).
