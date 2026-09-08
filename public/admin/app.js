/* ==================================================================
   DCITC ADMIN APP  —  static/admin/app.js
   ==================================================================
   Standalone admin application (served at /admin/). Talks to Supabase
   with the PUBLIC PUBLISHABLE KEY only (the legacy anon key is the
   fallback) — the database RLS policies (see
   supabase/migrations/001_init.sql) are what actually authorize every
   read/write; this UI merely reflects them. Draft rows are filtered
   server-side for anon, and every write fails for non-admins.

   Placeholders below ({{ADMIN_…}}) are substituted at build time by
   scripts/build.js with public, non-secret values only.
   ================================================================== */
(function () {
  'use strict';

  /* ---------- build-time injected, public-only values ---------- */
  const SUPABASE_URL = 'https://jeyzhrpskrzsbsumpjzc.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_b9di6_46yxzCcmlkuMTYsQ_p9XeWrnF';
  // slug catalogs for featured config (projects/resources stay in repo JSON)
  const PROJECT_SLUGS = ["nodhini","campusmesh","padchat","voltab","marktrack","algoplay"];
  const RESOURCE_SLUGS = ["the-c-programming-language","structure-and-interpretation-of-computer-programs","composing-programs","the-missing-semester-of-your-cs-education","git-for-beginners-official-docs","the-art-of-command-line","linux-journey","the-linux-command-line","man-pages-you-should-know","operating-systems-three-easy-pieces","computer-systems-a-programmer-s-perspective","systems-performance","mdn-web-docs","web-browser-engineering","css-for-engineers","practical-deep-learning-for-coders","neural-networks-and-deep-learning","hugging-face-nlp-course","portswigger-web-security-academy","overthewire-bandit","cryptopals","the-algorithm-design-manual","cses-problem-set","visualgo","the-art-of-electronics","esp32-technical-reference","practical-electronics-for-inventors","how-to-contribute-to-open-source","choosing-a-license","semantic-versioning"];
  // repo seeds for the six managed collections ("Seed from repo" buttons)
  window.ADMIN_COLLECTION_SEEDS = {"site":{"name":"Dhaka College IT Club","short":"DCITC","wordmark":"DHAKA COLLEGE / IT CLUB","tagline":"Curate. Build. Understand.","statement":"Shaping Tomorrow Today","established":"2025","email":"itclub@dhakacollege.edu.bd","location":"Dhaka College, Mirpur Road, Dhaka 1205, Bangladesh","locationShort":"Dhaka College Campus","logo":{"path":"/img/logo.svg","alt":"DCITC monogram — node graph mark"},"socials":[{"label":"GitHub","handle":"@dcitc","url":"https://github.com/"},{"label":"Facebook","handle":"/dcitc","url":"https://facebook.com/"},{"label":"YouTube","handle":"@dcitc","url":"https://youtube.com/"},{"label":"Discord","handle":"dcitc.study","url":"https://discord.com/"}],"meta":{"author":"DCITC Technical Team","language":"en","domain":"dcitc.example.edu.bd"},"facts":[{"k":"EST.","v":"2025"},{"k":"MEMBERS","v":"120+"},{"k":"PROJECTS","v":"4+"},{"k":"WORKSHOPS","v":"5+"},{"k":"DEPARTMENTS","v":"5"}]},"nav":{"items":[{"label":"About","href":"/about/","match":"/about","code":"01","group":"primary"},{"label":"Events","href":"/events/","match":"/events","code":"02","group":"primary"},{"label":"Projects","href":"/projects/","match":"/projects","code":"03","group":"primary"},{"label":"Achievements","href":"/achievements/","match":"/achievements","code":"04","group":"more"},{"label":"Gallery","href":"/gallery/","match":"/gallery","code":"05","group":"more"},{"label":"Resources","href":"/resources/","match":"/resources","code":"06","group":"primary"},{"label":"Journal","href":"/blog/","match":"/blog","code":"07","group":"primary"},{"label":"Team","href":"/team/","match":"/team","code":"08","group":"more"},{"label":"Contact","href":"/contact/","match":"/contact","code":"09","group":"more"},{"label":"Funkystuff","href":"/funkystuff/","match":"/funkystuff","code":"11","group":"more"},{"label":"Join","href":"/join/","match":"/join","code":"10","group":"more","cta":true}]},"team":{"current":"27","batches":{"26":{"label":"2026","groups":[{"name":"Executive Committee","code":"EXEC","note":"The founding committee that rebuilt the club from scratch.","members":[{"name":"Rafiq Hassan","role":"President","seed":"rafiq","note":"Rebuilt the club's technical infrastructure and launched the first study groups.","tags":["systems","leadership"]},{"name":"Sumaiya Khatun","role":"Vice President","seed":"sumaiya","note":"Started the algorithms study group and organized the first CTF.","tags":["algorithms","ctf"]},{"name":"Imran Ali","role":"General Secretary","seed":"imran","note":"Created the meeting notes system and the club's documentation archive.","tags":["documentation"]},{"name":"Fatima Rahman","role":"Treasurer","seed":"fatima","note":"Secured the initial budget for lab equipment and workshop materials.","tags":["operations"]},{"name":"Kamal Ahmed","role":"Technical Lead","seed":"kamal","note":"Built the club's first server and self-hosted Git instance.","tags":["linux","sysadmin"]},{"name":"Nadia Begum","role":"AI / ML Lead","seed":"nadia","note":"Started the NLP research track that became the Nodhini project.","tags":["nlp","ml"]},{"name":"Omar Faruk","role":"Systems Engineer","seed":"omar","note":"Designed the original CampusMesh network topology.","tags":["networking","systems"]},{"name":"Rashida Sultana","role":"Networking Lead","seed":"rashida","note":"Built the club's lab network and ran the first Linux workshop.","tags":["networking","linux"]},{"name":"Tanvir Islam","role":"Creative Lead","seed":"tanvir-c","note":"Designed the original DCITC logo, posters, and note templates.","tags":["design"]},{"name":"Ayesha Siddiqua","role":"Photography","seed":"ayesha","note":"Shot the first workshop series and built the photo archive.","tags":["photography"]},{"name":"Hasan Mahmud","role":"Events Lead","seed":"hasan","note":"Organized the first Build Week and established the workshop format.","tags":["events"]},{"name":"Maliha Noor","role":"Ops & Logistics","seed":"maliha","note":"Built the equipment checkout and inventory system.","tags":["ops"]}]}]},"27":{"label":"2027","groups":[{"name":"Executive Committee","code":"EXEC","note":"The core team running the club, defending its culture, and keeping every meeting short.","members":[{"name":"MD. Tanvir Ahmed","role":"President","seed":"tanvir","note":"Final year, CSE. Reads RFCs for fun and starts every meeting with a project demo.","tags":["networking","systems"]},{"name":"Farzana Yasmin","role":"Vice President","seed":"farzana","note":"Leads the algorithms study group and the club's competitive programming practice.","tags":["algorithms","cp"]},{"name":"Abdullah Al Mamun","role":"General Secretary","seed":"abdullah","note":"The club's institutional memory. Maintains the journal archive and meeting notes.","tags":["documentation"]},{"name":"Rima Sultana","role":"Treasurer","seed":"rima","note":"Keeps the budget honest enough to fund lab equipment. Also runs the media team's budget.","tags":["operations"]},{"name":"Arif Chowdhury","role":"Technical Lead","seed":"arif","note":"Lead on CampusMesh. Believes every problem is a systems problem until proven otherwise.","tags":["linux","systems"]},{"name":"Sadia Akter","role":"AI / ML Lead","seed":"sadia","note":"Lead on Nodhini. Runs the AI reading group and the journal's NLP track.","tags":["nlp","ml"]},{"name":"Sabbir Rahman","role":"Systems Engineer","seed":"sabbir","note":"PadChat author. Maintains the club's self-hosted services and the lab's LAN.","tags":["go","sysadmin"]},{"name":"Meherun Nesa","role":"Networking Lead","seed":"meherun","note":"Runs the Networking Deep Dive series and keeps the mesh honest.","tags":["networking","linux"]},{"name":"Tasnim Anjum","role":"Electronics Lead","seed":"tasnim","note":"VoltLab lead. Believes in measuring everything twice, including the multimeter.","tags":["esp32","electronics"]},{"name":"Rakib Hossain","role":"Security Lead","seed":"rakib","note":"Runs the CTF team and the security study group. Built last year's beginner CTF.","tags":["security","ctf"]},{"name":"Priya Das","role":"Web Engineer","seed":"priya","note":"Frontend of VoltLab's dashboard. Cares about accessibility and says so loudly.","tags":["web","a11y"]},{"name":"Mubashir Hasan","role":"Algorithms Engineer","seed":"mubashir","note":"AlgoPlay engine author. Turns blackboard algorithms into stepping visualizations.","tags":["algorithms","ts"]},{"name":"Mahin Khan","role":"Creative Lead","seed":"mahin","note":"Designs the study group note templates and every poster the club prints.","tags":["design"]},{"name":"Nusrat Jahan","role":"Photography","seed":"nusrat","note":"Shot the gallery's workshop series and maintains the club photo archive.","tags":["photography"]},{"name":"Sadman Sakib","role":"Video & Editing","seed":"sadman","note":"Produces the short 'how we work' videos from every Build Week.","tags":["video"]},{"name":"Tanzir Islam","role":"Events Lead","seed":"tanzir","note":"Runs the workshop pipeline from planning sheet to attendance list.","tags":["events"]},{"name":"Ibrahim Sarker","role":"Ops & Logistics","seed":"ibrahim","note":"Built the equipment checkout system the electronics group depends on.","tags":["ops"]},{"name":"Jannatul Ferdous","role":"Outreach","seed":"jannatul","note":"Coordinates with other departments and the national student tech community.","tags":["outreach"]}]}]}}},"projects":[{"slug":"nodhini","title":"Nodhini","tagline":"An open-source Bengali NLP toolkit built by the language study group.","status":"active","year":"2026","category":"AI / ML","stack":["Python","scikit-learn","spaCy","HuggingFace"],"summary":"Nodhini is a small but honest set of Bengali text-processing tools — tokenizer, stemmer, and POS tagger — written from first principles and shared under MIT. It exists because most commercial NLP pipelines treat Bangla as an afterthought.","problem":"Existing Bengali NLP tooling is either a thin wrapper around a single model or an abandoned research project. Students could not read the source, could not fix it, and could not learn from it. The club wanted a codebase small enough to read in one sitting.","approach":[{"title":"Corpus","detail":"Scraped and cleaned 40k headlines and exam questions; hand-labeled a 2k sentence gold set in a spreadsheet the whole study group could review."},{"title":"Tokenizer","detail":"Wrote a rule-based Bangla tokenizer first — no ML — to force the group to understand morphology before adding a model."},{"title":"Stemmer","detail":"Implemented a lightweight affix-stripping stemmer with a curated exception list, verified against 500 hand-checked verbs."},{"title":"Tagger","detail":"Trained a CRF tagger with feature engineering documented in the repo; precision measured on the gold set."}],"result":"0.86 POS accuracy on the held-out gold set, a 30-line tokenizer any first-year can read, and six students who now genuinely understand how a tagger works.","metrics":[{"k":"POS acc.","v":"86.1%"},{"k":"Gold set","v":"2,000"},{"k":"Lines core","v":"~900"},{"k":"Releases","v":"0.4.2"}],"team":[{"name":"Sadia Akter","role":"Lead"},{"name":"Rafiul Hasan","role":"Corpus"},{"name":"Nusrat Jahan","role":"Tagger"}],"links":{"github":"https://github.com/","demo":"https://huggingface.co/"},"notes":"Lessons learned became the journal post 'Why We Write Everything Down'.","capabilities":["Bangla tokenizer","Affix stemmer","CRF POS tagger","Evaluated on a public gold set"]},{"slug":"campusmesh","title":"CampusMesh","tagline":"An offline content mirror and mesh testbed running on lab Raspberry Pis.","status":"active","year":"2025","category":"Systems","stack":["Linux","nginx","Python","Raspberry Pi","batman-adv"],"summary":"A distributed offline server that mirrors course materials, an apt mirror, and club docs across the college network — designed so a lecture hall keeps working when the internet does not.","problem":"The college network goes down often and the library has a single aging desktop. During outages, practical classes stalled because materials lived online and no one had a local copy.","approach":[{"title":"Mirror","detail":"A nightly cron job syncs a curated set of docs, package mirrors and videos onto each node's SSD."},{"title":"Mesh","detail":"Nodes announce themselves over batman-adv; clients resolve dcitc.local to the nearest healthy node."},{"title":"Health","detail":"A tiny agent reports disk, uptime and sync age to a dashboard so members can see the mesh degrade in real time."}],"result":"Three lecture halls covered, zero manual intervention during the last two outages, and a standing example of why local caching matters.","metrics":[{"k":"Nodes","v":"3"},{"k":"Cached","v":"18 GB"},{"k":"Outage coverage","v":"2/2"},{"k":"Uptime","v":"99.1%"}],"team":[{"name":"Arif Chowdhury","role":"Lead"},{"name":"Meherun Nesa","role":"Networking"},{"name":"Tanzir Islam","role":"Ops"}],"links":{"github":"https://github.com/","demo":""},"notes":"The mesh setup spawned a study group on Linux networking.","capabilities":["Offline mirrors","Mesh failover","Health dashboard","apt + docs caching"]},{"slug":"padchat","title":"PadChat","tagline":"A dependency-free LAN chat server for the computer lab, written in Go.","status":"complete","year":"2025","category":"Systems","stack":["Go","WebSocket","SQLite"],"summary":"During one semester the lab's internet was throttled to near zero. PadChat gives the lab its own chat and shared note board over the LAN, with nothing but a single static binary.","problem":"Lab sessions needed a way to share snippets and ask the instructor for help without the internet. Existing tools either required an account or an external server.","approach":[{"title":"Protocol","detail":"A minimal JSON message protocol over WebSocket: text, code, and 'help request' events with a queue for the instructor."},{"title":"Board","detail":"A shared scratchpad persisted to SQLite so the session's notes survive reboots."},{"title":"Ship","detail":"Cross-compiled a single static binary; deployment is one file and one flag."}],"result":"Used for two semesters by three instructor sections; the codebase is small enough that a new member can trace a message end-to-end in an hour.","metrics":[{"k":"Binary size","v":"4.2 MB"},{"k":"Core lines","v":"~1,100"},{"k":"Dependencies","v":"0"},{"k":"Sessions","v":"40+"}],"team":[{"name":"Sabbir Rahman","role":"Lead"},{"name":"Farhan Karim","role":"Client"}],"links":{"github":"https://github.com/","demo":""},"notes":"Became the reference example in the systems reading group.","capabilities":["LAN messaging","Shared scratchpad","Instructor queue","Single static binary"]},{"slug":"voltab","title":"VoltLab","tagline":"An ESP32 datalogger the physics department actually uses in first-year labs.","status":"complete","year":"2024","category":"Electronics","stack":["ESP32","C","MicroPython","React"],"summary":"VoltLab replaces the paper stopwatch-and-ruler approach to capacitor discharge experiments with a $6 board that plots curves to a browser dashboard in real time.","problem":"Physics practicals measure capacitor discharge by eye and by hand. The results are noisy, slow, and demotivating. The department wanted data, not sketches.","approach":[{"title":"DAQ","detail":"ESP32 samples the ADC at 1 kHz, applies a moving average, and streams frames over WebSocket."},{"title":"Fit","detail":"The dashboard fits an exponential decay in the browser and reports tau with residual error, so students check theory against measurement."},{"title":"Zero config","detail":"The board creates its own access point; students connect and open one URL. No drivers, no install."}],"result":"Adopted for the 2024–25 first-year lab batch. Time constant measurements now agree with the expected value within 5%.","metrics":[{"k":"Sample rate","v":"1 kHz"},{"k":"Board cost","v":"~$6"},{"k":"Fit error","v":"< 5%"},{"k":"Labs","v":"3"}],"team":[{"name":"Tasnim Anjum","role":"Lead"},{"name":"Ibrahim Sarker","role":"Firmware"},{"name":"Priya Das","role":"Dashboard"}],"links":{"github":"https://github.com/","demo":""},"notes":"A physics teacher now co-advises the electronics reading group.","capabilities":["1 kHz sampling","Live plotting","Exponential fit","Zero-config setup"]},{"slug":"marktrack","title":"MarkTrack","tagline":"A CLI study tracker for spaced repetition, built in Rust to learn Rust.","status":"active","year":"2026","category":"Dev Tools","stack":["Rust","SQLite","tui-rs"],"summary":"MarkTrack is a small terminal app that schedules review sessions using a simplified Leitner system. It was the club's deliberate 'first serious Rust' project.","problem":"Members were learning Rust by tutorial, not by shipping. The club needed a project small enough to finish but real enough to force ownership, borrowing, and a file format.","approach":[{"title":"Scope","detail":"Three commands only: add, review, stats. Anything else was a PR proposal, not a requirement."},{"title":"Storage","detail":"SQLite via rusqlite; schema documented and versioned from day one."},{"title":"Review","detail":"The TUI shows one card, asks how well you remembered it, and moves it between three Leitner boxes."}],"result":"Shipped 0.9.0 and used internally for a month before opening issues; every author now feels confident reading and writing Rust.","metrics":[{"k":"Commands","v":"3"},{"k":"First release","v":"2026-04"},{"k":"Bugs filed","v":"0 (so far)"},{"k":"Reviewers","v":"5"}],"team":[{"name":"Nafis Alam","role":"Lead"},{"name":"Jannatul Ferdous","role":"Schema"},{"name":"Adnan Kabir","role":"TUI"}],"links":{"github":"https://github.com/","demo":""},"notes":"Its existence is the result — the tool itself is secondary.","capabilities":["Leitner review","TUI","SQLite storage","stats"]},{"slug":"algoplay","title":"AlgoPlay","tagline":"An algorithm visualizer that animates the code, not just the data.","status":"active","year":"2026","category":"Algorithms","stack":["TypeScript","Canvas","Vite"],"summary":"AlgoPlay lets members step through sorting and graph algorithms with the executing line of code highlighted next to the visualization — built during the algorithms reading group.","problem":"Blackboard walkthroughs of algorithms leave most students guessing at the loop invariants. Video tutorials are passive. The group wanted a tool they could pause, rewind, and argue with.","approach":[{"title":"Trace","detail":"An instrumented subset of algorithms emits step events; the visualizer is a pure function of the event log."},{"title":"Code sync","detail":"Each step maps back to a source line, rendered beside the canvas."},{"title":"Share","detail":"Steps serialize to a URL so a student can send a broken state to a friend."}],"result":"The reading group now runs its Tuesday sessions on AlgoPlay, and three 'aha' moments were directly attributed to rewinding a merge sort.","metrics":[{"k":"Algorithms","v":"12"},{"k":"Step types","v":"6"},{"k":"Weekly users","v":"~25"},{"k":"Rebuilds","v":"11"}],"team":[{"name":"Rakib Hossain","role":"Lead"},{"name":"Mubashir Hasan","role":"Engine"}],"links":{"github":"https://github.com/","demo":"https://vitejs.dev/"},"notes":"The step-log design influenced how the journal talks about tracing.","capabilities":["Sorting visualizer","Graph traversal","Step + rewind","Code-to-state sync"]}],"resources":[{"slug":"the-c-programming-language","title":"The C Programming Language","category":"Programming","kind":"book","level":"Beginner","tag":"fundamentals","description":"The book that teaches C and, by extension, how a computer actually executes code. Read it twice — once for syntax, once for the model it gives you.","link":"https://en.wikipedia.org/wiki/The_C_Programming_Language"},{"slug":"structure-and-interpretation-of-computer-programs","title":"Structure and Interpretation of Computer Programs","category":"Programming","kind":"book","level":"Intermediate","tag":"abstraction","description":"The classic text on building abstraction layers. Demanding, and worth every hour. The full text is free online.","link":"https://mitp-content-server.mit.edu/"},{"slug":"composing-programs","title":"Composing Programs","category":"Programming","kind":"tutorial","level":"Beginner","tag":"python","description":"A modern, web-native adaptation of SICP with Python. The club's entry point for first-years who want the SICP mindset without the Scheme.","link":"https://www.composingprograms.com/"},{"slug":"the-missing-semester-of-your-cs-education","title":"The Missing Semester of Your CS Education","category":"Dev Tools","kind":"tutorial","level":"Beginner","tag":"tooling","description":"MIT's crash course in the tools every student is assumed to know but nobody teaches: shell, editors, git, debugging, data wrangling.","link":"https://missing.csail.mit.edu/"},{"slug":"git-for-beginners-official-docs","title":"git-for-beginners (official docs)","category":"Dev Tools","kind":"documentation","level":"Beginner","tag":"git","description":"Start with the Pro Git book's first three chapters, then use the reference. Skip the ten-minute videos.","link":"https://git-scm.com/doc"},{"slug":"the-art-of-command-line","title":"The Art of Command Line","category":"Dev Tools","kind":"repo","level":"Intermediate","tag":"cli","description":"A dense, single-file field guide to the command line. Read one page a day and try everything it mentions.","link":"https://github.com/jlevy/the-art-of-command-line"},{"slug":"linux-journey","title":"Linux Journey","category":"Linux","kind":"tutorial","level":"Beginner","tag":"start-here","description":"A structured path through Linux basics: the filesystem, users, permissions, processes, and networking, with practice pages.","link":"https://linuxjourney.com/"},{"slug":"the-linux-command-line","title":"The Linux Command Line","category":"Linux","kind":"book","level":"Beginner","tag":"book","description":"A free, thorough book that turns you from a clicker into someone who composes commands. Our first-year recommended reading.","link":"https://linuxcommand.org/tlcl.php"},{"slug":"man-pages-you-should-know","title":"man pages you should know","category":"Linux","kind":"article","level":"Intermediate","tag":"reference","description":"Why `apropos` and `man -k` are your first debugging tools. Learning to read documentation beats memorizing it.","link":"https://man7.org/linux/man-pages/"},{"slug":"operating-systems-three-easy-pieces","title":"Operating Systems: Three Easy Pieces","category":"Systems","kind":"book","level":"Intermediate","tag":"ostep","description":"The canonical free OS text: virtualization, concurrency, persistence — with projects that mirror what our systems group builds.","link":"https://pages.cs.wisc.edu/~remzi/OSTEP/"},{"slug":"computer-systems-a-programmer-s-perspective","title":"Computer Systems: A Programmer's Perspective","category":"Systems","kind":"book","level":"Intermediate","tag":"csapp","description":"CS:APP connects C, assembly, the memory hierarchy, and links/loading into one coherent picture. The lab assignments are legendary.","link":"https://csapp.cs.cmu.edu/"},{"slug":"systems-performance","title":"Systems Performance","category":"Systems","kind":"book","level":"Advanced","tag":"measurement","description":"How to measure systems before theorizing about them. Reaches for when you want to understand why things are slow, not just that they are.","link":"https://www.brendangregg.com/"},{"slug":"mdn-web-docs","title":"MDN Web Docs","category":"Web","kind":"documentation","level":"Beginner","tag":"reference","description":"The only web reference we recommend. If a web answer isn't from MDN, verify it against MDN before trusting it.","link":"https://developer.mozilla.org/"},{"slug":"web-browser-engineering","title":"Web Browser Engineering","category":"Web","kind":"book","level":"Advanced","tag":"browser","description":"Build a tiny web browser from first principles in 400 pages. The best cure for 'magic black box' thinking about the web.","link":"https://browser.engineering/"},{"slug":"css-for-engineers","title":"CSS for Engineers","category":"Web","kind":"article","level":"Intermediate","tag":"css","description":"Layout as an engineering problem: box model, flow, flexbox, grid, and why 'make it work' comes before 'make it pretty'.","link":"https://web.dev/learn/css"},{"slug":"practical-deep-learning-for-coders","title":"Practical Deep Learning for Coders","category":"AI / ML","kind":"tutorial","level":"Beginner","tag":"fastai","description":"fast.ai's top-down course: train real models in lesson one, then fill in theory. We run this inside our AI reading group.","link":"https://course.fast.ai/"},{"slug":"neural-networks-and-deep-learning","title":"Neural Networks and Deep Learning","category":"AI / ML","kind":"book","level":"Intermediate","tag":"theory","description":"Michael Nielsen's free, interactive book. The chapter on how backpropagation actually works is the best one we know.","link":"http://neuralnetworksanddeeplearning.com/"},{"slug":"hugging-face-nlp-course","title":"Hugging Face NLP Course","category":"AI / ML","kind":"tutorial","level":"Intermediate","tag":"nlp","description":"From tokenizers to fine-tuning, hands-on. The companion to our Nodhini project.","link":"https://huggingface.co/learn/nlp-course"},{"slug":"portswigger-web-security-academy","title":"PortSwigger Web Security Academy","category":"Security","kind":"tutorial","level":"Intermediate","tag":"web","description":"Free labs that teach web vulnerabilities by making you exploit them. The best practical security training that exists for free.","link":"https://portswigger.net/web-security"},{"slug":"overthewire-bandit","title":"OverTheWire Bandit","category":"Security","kind":"tool","level":"Beginner","tag":"ctf","description":"A level-based game that teaches Linux security basics through puzzles. Our CTF team's warm-up.","link":"https://overthewire.org/wargames/bandit/"},{"slug":"cryptopals","title":"CryptoPals","category":"Security","kind":"tool","level":"Intermediate","tag":"crypto","description":"Cryptography challenges that force you to implement attacks, not memorize them. Expect to feel humbled.","link":"https://cryptopals.com/"},{"slug":"the-algorithm-design-manual","title":"The Algorithm Design Manual","category":"Algorithms","kind":"book","level":"Intermediate","tag":"book","description":"Skiena's practical take on algorithm design — a catalog of problems and when to reach for them, instead of a wall of proofs.","link":"https://www.algorist.com/"},{"slug":"cses-problem-set","title":"CSES Problem Set","category":"Algorithms","kind":"tool","level":"Intermediate","tag":"practice","description":"300 curated problems ranked by difficulty. Our algorithms group's homework source.","link":"https://cses.fi/problemset/"},{"slug":"visualgo","title":"VisuAlgo","category":"Algorithms","kind":"tool","level":"Beginner","tag":"visualize","description":"Interactive algorithm visualization. Pair it with our own AlgoPlay and you will never need a gif again.","link":"https://visualgo.net/"},{"slug":"the-art-of-electronics","title":"The Art of Electronics","category":"Electronics","kind":"book","level":"Advanced","tag":"book","description":"The engineer's handbook for circuits. Keep it next to VoltLab's bench; answer 'why is it doing that?' before touching the firmware.","link":"https://artofelectronics.net/"},{"slug":"esp32-technical-reference","title":"ESP32 Technical Reference","category":"Electronics","kind":"documentation","level":"Intermediate","tag":"esp32","description":"The datasheet-ish manual for our datalogger board. Learning to read reference manuals is a skill; start here.","link":"https://www.espressif.com/"},{"slug":"practical-electronics-for-inventors","title":"Practical Electronics for Inventors","category":"Electronics","kind":"book","level":"Beginner","tag":"start","description":"A gentler entry than Horowitz & Hill, with the same honesty about how components actually behave.","link":"https://www.mhprofessional.com/"},{"slug":"how-to-contribute-to-open-source","title":"How to Contribute to Open Source","category":"Open Source","kind":"tutorial","level":"Beginner","tag":"first-pr","description":"Open Source Guide's checklist for a first contribution, from reading CONTRIBUTING to surviving your first review.","link":"https://opensource.guide/how-to-contribute/"},{"slug":"choosing-a-license","title":"Choosing a License","category":"Open Source","kind":"article","level":"Beginner","tag":"legal","description":"What MIT, Apache-2.0, and GPL actually mean for your project. Read this before the club's next release.","link":"https://choosealicense.com/"},{"slug":"semantic-versioning","title":"Semantic Versioning","category":"Open Source","kind":"article","level":"Beginner","tag":"release","description":"The spec our projects follow. Version numbers are communication; learn to speak it.","link":"https://semver.org/"}],"achievements":[{"year":"2024","summary":"The club rebuilds itself as a study organization rather than an events-only club.","items":[{"title":"Study groups founded","detail":"Three reading groups launched: Systems, Algorithms, and AI/ML. Each meets weekly and produces public notes."},{"title":"First Linux workshop","detail":"A sold-out terminal workshop for 40 students — the template every workshop since has followed."},{"title":"VoltLab begins","detail":"A physics department request starts the electronics track; the first prototype runs in the club lab."}]},{"year":"2025","summary":"The first shipped software, a department adoption, and a national CTF finish.","items":[{"title":"Three projects shipped","detail":"PadChat enters the computer lab, VoltLab is adopted by the physics department, and CampusMesh covers two lecture halls."},{"title":"National CTF top 20","detail":"A mixed team of four reaches the top 20 in a national capture-the-flag — the club's first competitive placement."},{"title":"Journal launches","detail":"The Tech Journal publishes its first issue: a systems post and a field report from VoltLab."}]},{"year":"2026","summary":"Open source, 120+ members, and infrastructure the club runs itself.","items":[{"title":"Nodhini goes open source","detail":"The Bengali NLP toolkit releases under MIT; two external contributors submit PRs within a month."},{"title":"100+ active members","detail":"Membership passes 120, spread across six study groups and four project teams."},{"title":"Build Week","detail":"The first 48-hour hackathon ships nine runnable projects and becomes a standing event."},{"title":"Self-hosted infra","detail":"The club moves its journal, mirrors, and CTF infrastructure onto its own hardware."}]}]};

  if (!SUPABASE_URL || SUPABASE_URL.indexOf('{{') === 0) {
    document.body.innerHTML =
      '<div class="login-wrap"><div class="login-box"><h1>Admin not configured</h1>' +
      '<p class="hint">The build has no Supabase URL yet. Create <code class="k">.env</code> from ' +
      '<code class="k">.env.example</code> and rebuild the site.</p></div></div>';
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  let ADMIN = false;
  let current = 'dashboard';

  /* ---------- tiny helpers ---------- */

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

  let statusTimer;
  function status(msg, kind) {
    const el = $('#status');
    el.textContent = msg;
    el.className = `status show ${kind || ''}`;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (el.className = 'status'), 4200);
  }

  // every DB call funnels through here so failures are always surfaced
  async function db(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }

  function fmtErr(e) {
    return (e && (e.message || e.error_description || e.error)) || String(e);
  }

  function renderMarkdownPreview(md, target) {
    const raw = window.marked.parse(md || '');
    target.innerHTML = window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }

  /* ---------- auth gate ---------- */

  // A failed sign-in (bad credentials) never reaches onAuthStateChange
  // with SIGNED_OUT, but a session that dies mid-page does. To keep the
  // login box able to show the REAL error, distinguish the two:
  //   1. sign-in submit renders its own inline message (and clears it on
  //      the next attempt);
  //   2. the SIGNED_OUT listener only toasts when there isn't already an
  //      inline login error on screen.
  function loginErrorBox() {
    const box = $('#login-error');
    if (!box) {
      status('', '');
      return null;
    }
    return box;
  }
  function showLoginError(msg) {
    const box = loginErrorBox();
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
  }
  function clearLoginError() {
    const box = loginErrorBox();
    if (box) {
      box.textContent = '';
      box.hidden = true;
    }
  }

  async function loadProfile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    try {
      const rows = await db(sb.from('profiles').select('email,is_admin').eq('id', user.id).single());
      ADMIN = Boolean(rows && rows.is_admin);
      $('#whoami').textContent = (rows && rows.email) || user.email || user.id;
    } catch (e) {
      ADMIN = false;
      $('#whoami').textContent = user.email || user.id;
    }
    return ADMIN;
  }

  function showLogin(message) {
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    if (message) status(message, 'err');
  }

  async function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    nav(current);
  }

  async function checkSession() {
    const ok = await loadProfile();
    if (ok) showApp();
    else {
      await sb.auth.signOut();
      showLogin(ok === false && $('#whoami').textContent ? 'This account does not have admin access.' : '');
    }
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginError();
    const btn = $('#login-btn');
    btn.disabled = true;
    try {
      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!(await loadProfile())) {
        await sb.auth.signOut();
        throw new Error('This account does not have admin access.');
      }
      clearLoginError();
      status('Signed in.', 'ok');
      showApp();
    } catch (err) {
      // TRANSLATE the raw auth errors into what the club member actually
      // needs to do. The generic signOut() fallback above (non-admin)
      // surfaces here as an Error too.
      const raw = fmtErr(err);
      const em = $('#login-email').value.trim() || '';
      let msg = raw;
      const lower = `${raw} ${em}`.toLowerCase();
      if (lower.includes('invalid login credentials') || lower.includes('invalid credentials') || lower.includes('wrong password')) {
        msg = 'Email or password is incorrect. Check the credentials and try again.';
      } else if (lower.includes('email not confirmed')) {
        msg = 'Email not confirmed yet. Check your inbox (and spam) for the confirmation link, or ask an admin to confirm it for you.';
      } else if (lower.includes('already registered') || lower.includes('already exists')) {
        msg = 'Account exists but can not sign in — it was provisioned by the club; if this is new, confirm the email first.';
      } else if (lower.includes('admin access') || lower.includes('not have admin')) {
        msg = 'This account is not an administrator. Ask the club to grant admin access.';
      } else if (lower.includes('invalid api key')) {
        msg = 'Admin is not configured for this build yet (rebuild the site with Supabase keys in .env).';
      }
      showLoginError(msg);
      status(msg, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout-btn').addEventListener('click', () => sb.auth.signOut());

  // covers logout from another tab, expired refresh tokens, etc. Only
  // toast when there's no inline login error — otherwise a mid-login
  // session death would overwrite the real reason with "Signed out.".
  sb.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return;
    const box = $('#login-error');
    if (box && !box.hidden) return;
    showLogin('Signed out.');
  });

  /* ---------- router ---------- */

  const views = {};
  function nav(name) {
    current = name;
    $$('.admin-side [data-nav]').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === name));
    const main = $('#main');
    main.innerHTML = '';
    views[name](main).catch((e) => {
      main.innerHTML = `<div class="panel"><h2>Could not load “${esc(name)}”</h2><p class="hint">${esc(fmtErr(e))}</p></div>`;
    });
  }
  $$('.admin-side [data-nav]').forEach((b) => b.addEventListener('click', () => nav(b.dataset.nav)));

  /* ---------- shared editors ---------- */

  function chipEditor(items, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    const render = () => {
      wrap.innerHTML =
        items.map((it, i) => `<span class="chip">${esc(it)}<button type="button" data-i="${i}" aria-label="remove">×</button></span>`).join('') +
        `<input type="text" placeholder="${esc(placeholder || 'add…')}" style="max-width:160px" />`;
    };
    render();
    wrap.addEventListener('click', (e) => {
      const i = e.target.dataset && e.target.dataset.i;
      if (i !== undefined) {
        items.splice(Number(i), 1);
        render();
      }
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.value.trim()) {
        e.preventDefault();
        items.push(e.target.value.trim());
        render();
        $('input', wrap).focus();
      }
    });
    wrap.getItems = () => items.filter((x) => String(x).trim());
    return wrap;
  }

  // program timeline editor: rows of {time, title}
  function programEditor(rows) {
    const wrap = document.createElement('div');
    wrap.className = 'stack';
    const render = () => {
      wrap.innerHTML = rows
        .map(
          (r, i) => `<div class="row" data-i="${i}" style="grid-template-columns:110px 1fr 40px">
            <input type="text" data-k="time" value="${esc(r.time)}" placeholder="14:00" />
            <input type="text" data-k="title" value="${esc(r.title)}" placeholder="Segment title" />
            <button type="button" class="btn small danger" data-del="${i}" aria-label="remove">×</button>
          </div>`,
        )
        .join('') + '<button type="button" class="btn small" data-add>+ add row</button>';
    };
    render();
    wrap.addEventListener('input', (e) => {
      const box = e.target.closest('[data-i]');
      if (box) rows[Number(box.dataset.i)][e.target.dataset.k] = e.target.value;
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.dataset.del !== undefined) {
        rows.splice(Number(e.target.dataset.del), 1);
        render();
      } else if (e.target.dataset.add !== undefined) {
        rows.push({ time: '', title: '' });
        render();
        const inputs = $$('input', wrap);
        inputs[inputs.length - 2].focus();
      }
    });
    wrap.getRows = () => rows.filter((r) => String(r.title || '').trim() || String(r.time || '').trim());
    return wrap;
  }

  function field(label, inputHtml) {
    return `<label class="field"><span>${esc(label)}</span>${inputHtml}</label>`;
  }
  function textField(name, label, value, attrs) {
    return field(label, `<input type="text" name="${name}" value="${esc(value == null ? '' : value)}" ${attrs || ''} />`);
  }

  function mdEditor(name, value) {
    return `<div class="field"><span>Markdown</span>
      <textarea name="${name}" class="md" spellcheck="false">${esc(value || '')}</textarea>
      <div class="btn-row"><button type="button" class="btn small" data-preview>Preview</button></div>
      <div class="panel md-preview" style="display:none"></div>
    </div>`;
  }
  // delegate preview toggles inside any form
  document.addEventListener('click', (e) => {
    if (!e.target.dataset || e.target.dataset.preview === undefined) return;
    const btn = e.target;
    const form = btn.closest('form, .panel');
    const ta = $('textarea.md', form);
    const box = $('.md-preview', form);
    if (box.style.display === 'none') {
      renderMarkdownPreview(ta.value, box);
      box.style.display = '';
      btn.textContent = 'Hide preview';
    } else {
      box.style.display = 'none';
      btn.textContent = 'Preview';
    }
  });

  /* ================================================================
     DASHBOARD
     ================================================================ */
  views.dashboard = async (main) => {
    const [posts, events, funky] = await Promise.all([
      db(sb.from('posts').select('slug,draft')),
      db(sb.from('events').select('slug,draft,status')),
      db(sb.from('funkystuff_items').select('slug,draft')),
    ]);
    const live = (arr) => arr.filter((x) => !x.draft).length;
    const upcoming = events.filter((e) => e.status === 'upcoming' && !e.draft).length;
    main.innerHTML = `
      <h1 class="admin-title">Dashboard</h1>
      <p class="admin-sub">Content lives in Supabase. After editing, rebuild the static site
      (<code class="k">node scripts/build.js</code>) to publish it to the public pages —
      the build reads everything you change here.</p>
      <div class="featured-cols">
        <div class="panel"><h2>Posts</h2><p class="mono">${live(posts)} live · ${posts.length - live(posts)} draft</p></div>
        <div class="panel"><h2>Events</h2><p class="mono">${live(events)} live · ${upcoming} upcoming</p></div>
        <div class="panel"><h2>Funkystuff</h2><p class="mono">${live(funky)} live · ${funky.length - live(funky)} draft</p></div>
      </div>
      <div class="panel"><h2>Publish flow</h2>
        <p class="hint">1. edit content here (drafts stay private) → 2. flip to live →
        3. rebuild <code class="k">node scripts/build.js</code> → the static site regenerates from the database.
        Drafts are never readable by the public site — the database refuses it.</p>
      </div>`;
  };

  /* ================================================================
     POSTS
     ================================================================ */
  views.posts = async (main) => {
    const rows = await db(sb.from('posts').select('*').order('date', { ascending: false }));
    main.innerHTML = `
      <h1 class="admin-title">Posts</h1>
      <div class="btn-row" style="margin-bottom:1rem"><button class="btn primary" id="new-post">+ New post</button></div>
      <div class="panel"><table class="list"><thead><tr><th>Title</th><th>Slug</th><th>Date</th><th>State</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td>${esc(r.title)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.slug)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.date)}</td>
            <td><span class="badge ${r.draft ? 'draft' : 'live'}">${r.draft ? 'draft' : 'live'}</span></td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn small" data-edit="${r.id}">Edit</button>
              ${r.draft ? '' : `<a class="btn small" href="/blog/${esc(r.slug)}/" target="_blank" rel="noopener">View</a>`}
              <button class="btn small danger" data-del="${r.id}" data-slug="${esc(r.slug)}">Del</button>
            </td>
          </tr>`,
        )
        .join('') || '<tr><td colspan="5" class="empty">No posts yet.</td></tr>'}</tbody></table></div>`;
    $('#new-post', main).addEventListener('click', () => postForm(null));
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => postForm(rows.find((r) => r.id === b.dataset.edit))));
    $$('[data-del]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete post “${b.dataset.slug}” permanently?`)) return;
        try {
          await db(sb.from('posts').delete().eq('id', b.dataset.del));
          status('Post deleted.', 'ok');
          nav('posts');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  function postForm(row) {
    const r = row || { tags: [], date: new Date().toISOString().slice(0, 10), draft: true };
    const tags = chipEditor(Array.isArray(r.tags) ? [...r.tags] : [], 'add tag');
    const main = $('#main');
    main.innerHTML = `
      <h1 class="admin-title">${row ? 'Edit post' : 'New post'}</h1>
      <form id="post-form">
        <div class="panel">
          <div class="row">
            ${textField('title', 'Title', r.title, 'required')}
            ${textField('slug', 'Slug (the URL: /blog/&lt;slug&gt;/)', r.slug, r.slug ? 'readonly' : 'required pattern="[a-z0-9][a-z0-9-]*"')}
            ${field('Date', `<input type="date" name="date" value="${esc(r.date)}" required />`)}
          </div>
          <div class="row">
            ${textField('author', 'Author', r.author == null ? 'DCITC' : r.author)}
            ${textField('role', 'Author role', r.role == null ? 'Contributor' : r.role)}
            ${textField('category', 'Category chip', r.category)}
          </div>
          ${textField('description', 'Description (cards + meta)', r.description)}
          ${field('Tags', '')}
          <div id="tags-slot"></div>
          ${textField('image', 'Cover image URL (blank = generated plate)', r.image)}
          <label class="field"><span>State</span>
            <select name="draft">
              <option value="true" ${r.draft ? 'selected' : ''}>Draft — hidden from the public site</option>
              <option value="false" ${!r.draft ? 'selected' : ''}>Live — publishes on next build</option>
            </select>
          </label>
          ${mdEditor('content_markdown', r.content_markdown)}
          <div class="btn-row">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" id="cancel-edit">Back</button>
            <span class="hint" style="margin-left:auto">Saved markdown is sanitized when the site is built.</span>
          </div>
        </div>
      </form>`;
    $('#tags-slot', main).appendChild(tags);
    $('#cancel-edit', main).addEventListener('click', () => nav('posts'));
    $('#post-form', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const slug = f.slug.value.trim();
      if (!SLUG_RE.test(slug)) return status('Slug must be lowercase letters, digits and hyphens.', 'err');
      if (!f.title.value.trim()) return status('Title is required.', 'err');
      const payload = {
        slug,
        title: f.title.value.trim(),
        date: f.date.value,
        description: f.description.value.trim(),
        author: f.author.value.trim() || 'DCITC',
        role: f.role.value.trim() || 'Contributor',
        category: f.category.value.trim() || null,
        tags: tags.getItems(),
        image: f.image.value.trim() || null,
        draft: f.draft.value === 'true',
        content_markdown: f.content_markdown.value,
      };
      try {
        if (row) await db(sb.from('posts').update(payload).eq('id', row.id));
        else await db(sb.from('posts').insert(payload));
        status(row ? 'Post saved.' : 'Post created.', 'ok');
        nav('posts');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
  }

  /* ================================================================
     EVENTS
     ================================================================ */
  views.events = async (main) => {
    const rows = await db(sb.from('events').select('*').order('date', { ascending: false }));
    main.innerHTML = `
      <h1 class="admin-title">Events</h1>
      <div class="btn-row" style="margin-bottom:1rem"><button class="btn primary" id="new-event">+ New event</button></div>
      <div class="panel"><table class="list"><thead><tr><th>Title</th><th>Slug</th><th>Date</th><th>Status</th><th>State</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td>${esc(r.title)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.slug)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.date)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.status)}</td>
            <td><span class="badge ${r.draft ? 'draft' : 'live'}">${r.draft ? 'draft' : 'live'}</span></td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn small" data-edit="${r.id}">Edit</button>
              ${r.draft ? '' : `<a class="btn small" href="/events/${esc(r.slug)}/" target="_blank" rel="noopener">View</a>`}
              <button class="btn small danger" data-del="${r.id}" data-slug="${esc(r.slug)}">Del</button>
            </td>
          </tr>`,
        )
        .join('') || '<tr><td colspan="6" class="empty">No events yet.</td></tr>'}</tbody></table></div>`;
    $('#new-event', main).addEventListener('click', () => eventForm(null));
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => eventForm(rows.find((r) => r.id === b.dataset.edit))));
    $$('[data-del]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete event “${b.dataset.slug}” permanently?`)) return;
        try {
          await db(sb.from('events').delete().eq('id', b.dataset.del));
          status('Event deleted.', 'ok');
          nav('events');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  function eventForm(row) {
    const r = row || {
      status: 'upcoming',
      date: new Date().toISOString().slice(0, 10),
      draft: true,
      speaker: {},
      program: [],
      resources: [],
    };
    const resources = chipEditor(Array.isArray(r.resources) ? [...r.resources] : [], 'add track');
    const program = programEditor(Array.isArray(r.program) ? r.program.map((p) => ({ ...p })) : []);
    const main = $('#main');
    main.innerHTML = `
      <h1 class="admin-title">${row ? 'Edit event' : 'New event'}</h1>
      <form id="event-form">
        <div class="panel">
          <div class="row">
            ${textField('title', 'Title', r.title, 'required')}
            ${textField('slug', 'Slug (the URL: /events/&lt;slug&gt;/)', r.slug, r.slug ? 'readonly' : 'required pattern="[a-z0-9][a-z0-9-]*"')}
            ${field('Date', `<input type="date" name="date" value="${esc(r.date)}" required />`)}
            ${field('Status', `<select name="status">
              ${['upcoming', 'ongoing', 'past'].map((s) => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>`)}
          </div>
          ${textField('subtitle', 'Subtitle (deck/archive cards)', r.subtitle)}
          ${textField('description', 'Short brief (detail page fallback)', r.description)}
          <div class="row">
            ${textField('location', 'Location', r.location)}
            ${textField('duration', 'Duration', r.duration)}
            ${textField('level', 'Level', r.level)}
          </div>
          <div class="row">
            ${textField('speaker_name', 'Speaker name', r.speaker && r.speaker.name)}
            ${textField('speaker_role', 'Speaker role', r.speaker && r.speaker.role)}
          </div>
          ${field('Program timeline', '')}
          <div id="program-slot"></div>
          ${field('Resource tracks', '')}
          <div id="resources-slot"></div>
          ${textField('register', 'Registration note', r.register)}
          <label class="field"><span>State</span>
            <select name="draft">
              <option value="true" ${r.draft ? 'selected' : ''}>Draft — hidden from the public site</option>
              <option value="false" ${!r.draft ? 'selected' : ''}>Live — publishes on next build</option>
            </select>
          </label>
          ${mdEditor('content_markdown', r.content_markdown)}
          <p class="hint">Optional long-form writeup. Keep it short — the event page renders it inside the About plate.</p>
          <div class="btn-row">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" id="cancel-edit">Back</button>
          </div>
        </div>
      </form>`;
    $('#program-slot', main).appendChild(program);
    $('#resources-slot', main).appendChild(resources);
    $('#cancel-edit', main).addEventListener('click', () => nav('events'));
    $('#event-form', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const slug = f.slug.value.trim();
      if (!SLUG_RE.test(slug)) return status('Slug must be lowercase letters, digits and hyphens.', 'err');
      if (!f.title.value.trim()) return status('Title is required.', 'err');
      const payload = {
        slug,
        title: f.title.value.trim(),
        date: f.date.value,
        status: f.status.value,
        subtitle: f.subtitle.value.trim(),
        description: f.description.value.trim(),
        location: f.location.value.trim() || null,
        duration: f.duration.value.trim() || null,
        level: f.level.value.trim() || null,
        speaker: { name: f.speaker_name.value.trim(), role: f.speaker_role.value.trim() },
        program: program.getRows(),
        resources: resources.getItems(),
        register: f.register.value.trim() || null,
        draft: f.draft.value === 'true',
        content_markdown: f.content_markdown.value,
      };
      try {
        if (row) await db(sb.from('events').update(payload).eq('id', row.id));
        else await db(sb.from('events').insert(payload));
        status(row ? 'Event saved.' : 'Event created.', 'ok');
        nav('events');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
  }

  /* ================================================================
     FUNKYSTUFF
     ================================================================ */
  views.funkystuff = async (main) => {
    const rows = await db(sb.from('funkystuff_items').select('*').order('sort'));
    main.innerHTML = `
      <h1 class="admin-title">Funkystuff</h1>
      <div class="btn-row" style="margin-bottom:1rem"><button class="btn primary" id="new-funky">+ Add project</button></div>
      <div class="panel"><table class="list"><thead><tr><th>Title</th><th>Slug</th><th>Dept</th><th>By</th><th>State</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td>${esc(r.title)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.slug)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.dept)}</td>
            <td style="font-size:.85rem">${esc(r.by)}</td>
            <td><span class="badge ${r.draft ? 'draft' : 'live'}">${r.draft ? 'draft' : 'live'}</span></td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn small" data-edit="${r.id}">Edit</button>
              <button class="btn small" data-files="${r.slug}">Files</button>
              ${r.draft ? '' : `<a class="btn small" href="${esc(r.entry_file === 'index.html' ? '/funkystuff/' + esc(r.slug) + '/' : '/funkystuff/' + esc(r.slug) + '/' + esc(r.entry_file))}" target="_blank" rel="noopener">Open</a>`}
              <button class="btn small danger" data-del="${r.id}" data-slug="${esc(r.slug)}">Del</button>
            </td>
          </tr>`,
        )
        .join('') || '<tr><td colspan="6" class="empty">Nothing here yet.</td></tr>'}</tbody></table></div>
      <div id="files-panel"></div>`;
    $('#new-funky', main).addEventListener('click', () => funkyForm(null));
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => funkyForm(rows.find((r) => r.id === b.dataset.edit))));
    $$('[data-files]', main).forEach((b) => b.addEventListener('click', () => showFunkyFiles(b.dataset.files)));
    $$('[data-del]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete funkystuff project “${b.dataset.slug}” (metadata + all files)?`)) return;
        try {
          const objs = await sb.storage.from('funkystuff').list(b.dataset.slug, { limit: 1000 });
          if (objs && objs.length) {
            await sb.storage.from('funkystuff').remove(objs.map((o) => `${b.dataset.slug}/${o.name}`));
          }
          await db(sb.from('funkystuff_items').delete().eq('id', b.dataset.del));
          status('Project deleted.', 'ok');
          nav('funkystuff');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  async function showFunkyFiles(slug) {
    const panel = $('#files-panel');
    panel.innerHTML = `<div class="panel"><h2>Files — <span class="mono">${esc(slug)}</span></h2><p class="empty">loading…</p></div>`;
    const objs = await sb.storage.from('funkystuff').list(slug, { limit: 1000 });
    panel.innerHTML = `<div class="panel"><h2>Files — <span class="mono">${esc(slug)}</span></h2>
      ${
        objs && objs.length
          ? `<table class="list"><tbody>${objs
              .map(
                (o) => `<tr><td class="mono" style="font-size:.8rem">${esc(o.name)}</td>
                  <td style="text-align:right"><button class="btn small danger" data-rm="${esc(o.name)}">Delete</button></td></tr>`,
              )
              .join('')}</tbody></table>`
          : '<p class="empty">No files uploaded yet.</p>'
      }
      <div class="btn-row"><input type="file" id="file-input" multiple />
        <button class="btn" id="upload-btn">Upload to ${esc(slug)}/</button></div>
      <p class="hint">Multiple files are supported (multi-asset projects). The entry file listed on the item opens in a new tab.</p>
    </div>`;
    $$('[data-rm]', panel).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete file ${b.dataset.rm}?`)) return;
        try {
          await sb.storage.from('funkystuff').remove([`${slug}/${b.dataset.rm}`]);
          showFunkyFiles(slug);
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
    $('#upload-btn', panel).addEventListener('click', async () => {
      const files = $('#file-input', panel).files;
      if (!files.length) return status('Choose files first.', 'err');
      try {
        for (const f of files) {
          const { error } = await sb.storage.from('funkystuff').upload(`${slug}/${f.name}`, f, { upsert: true });
          if (error) throw error;
        }
        status(`${files.length} file(s) uploaded.`, 'ok');
        showFunkyFiles(slug);
      } catch (e) {
        status(fmtErr(e), 'err');
      }
    });
  }

  function funkyForm(row) {
    const r = row || { entry_file: 'index.html', sort: 0, draft: true };
    const main = $('#main');
    main.innerHTML = `
      <h1 class="admin-title">${row ? 'Edit project' : 'Add project'}</h1>
      <form id="funky-form">
        <div class="panel">
          <div class="row">
            ${textField('title', 'Title', r.title, 'required')}
            ${textField('slug', 'Slug (also the storage folder)', r.slug, r.slug ? 'readonly' : 'required')}
            ${textField('dept', 'Department (filter chip)', r.dept, 'required')}
            ${textField('by', 'Author byline', r.by)}
          </div>
          <div class="row">
            ${textField('entry_file', 'Entry file (opened by list rows)', r.entry_file)}
            ${field('Sort order', `<input type="number" name="sort" value="${Number(r.sort) || 0}" />`)}
          </div>
          <label class="field"><span>State</span>
            <select name="draft">
              <option value="true" ${r.draft ? 'selected' : ''}>Draft — hidden</option>
              <option value="false" ${!r.draft ? 'selected' : ''}>Live</option>
            </select>
          </label>
          <p class="hint">Save first, then use “Files” on the list row to upload the project's HTML/assets.</p>
          <div class="btn-row">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" id="cancel-edit">Back</button>
          </div>
        </div>
      </form>`;
    $('#cancel-edit', main).addEventListener('click', () => nav('funkystuff'));
    $('#funky-form', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.title.value.trim() || !f.dept.value.trim()) return status('Title and department are required.', 'err');
      const payload = {
        title: f.title.value.trim(),
        dept: f.dept.value.trim(),
        by: f.by.value.trim(),
        entry_file: f.entry_file.value.trim() || 'index.html',
        sort: Number(f.sort.value) || 0,
        draft: f.draft.value === 'true',
      };
      try {
        if (row) {
          await db(sb.from('funkystuff_items').update(payload).eq('id', row.id));
        } else {
          const slug = f.slug.value.trim();
          if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) return status('Slug must be URL-safe (letters/digits/-/_/.).', 'err');
          await db(sb.from('funkystuff_items').insert({ ...payload, slug }));
        }
        status('Project saved.', 'ok');
        nav('funkystuff');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
  }

  /* ================================================================
     GALLERY
     ================================================================ */
  // The photo strip: metadata lives in gallery_items, image files in the
  // `gallery` storage bucket (flat — object key IS the file name). RLS:
  // anon reads published rows + downloads; admins manage everything.
  views.gallery = async (main) => {
    const rows = await db(sb.from('gallery_items').select('*').order('sort')).catch(() => []).then((r) => r || []);
    main.innerHTML = `
      <h1 class="admin-title">Gallery</h1>
      <p class="admin-sub">Drop images here and toggle each to live. The strip is rebuilt on the next
      <code class="k">node scripts/build.js</code> — sort order drives left-to-right placement.</p>
      <div class="panel">
        <div class="btn-row">
          <input type="file" id="gallery-files" accept="image/*" multiple />
          <button class="btn primary" id="gallery-upload">+ Upload</button>
        </div>
        <p class="hint" style="margin-top:.4rem">jpg/jpeg/png/webp/gif/svg. Filenames must be URL-safe
        (letters, digits, dash, underscore, dot — no spaces). The file name becomes the URL: /gallery/&lt;file&gt;.</p>
      </div>
      <div class="panel"><div class="gal-grid" id="gallery-grid">
        ${
          rows.length
            ? rows
                .map(
                  (r) => `<div class="gal-row" data-file="${esc(r.file)}">
                    <img src="${esc(`/gallery/${r.file}`)}" alt="" loading="lazy" />
                    <div class="gal-meta"><input type="text" data-caption value="${esc(r.caption)}" placeholder="caption" />
                      <span class="mono" style="font-size:.75rem">${esc(r.file)}</span></div>
                    <label class="chk">live
                      <input type="checkbox" data-draft ${r.draft ? '' : 'checked'} />
                    </label>
                    <button class="btn small danger" data-del="${esc(r.file)}">Del</button>
                  </div>`,
                )
                .join('')
            : '<p class="empty">No gallery items yet.</p>'
        }
      </div></div>`;
    $('#gallery-upload', main).addEventListener('click', uploadGalleryFiles);
    $('#gallery-grid', main).addEventListener('change', async (e) => {
      const rowEl = e.target.closest('[data-file]');
      if (!rowEl) return;
      const file = rowEl.dataset.file;
      const caption = $('[data-caption]', rowEl).value.trim();
      const live = $('[data-draft]', rowEl).checked;
      try {
        await db(sb.from('gallery_items').update({ caption, draft: !live }).eq('file', file));
        status('Gallery item updated.', 'ok');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
    $('#gallery-grid', main).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      (async () => {
        if (!confirm(`Delete gallery item ${btn.dataset.del} (row + file)?`)) return;
        try {
          await sb.storage.from('gallery').remove([btn.dataset.del]);
          await db(sb.from('gallery_items').delete().eq('file', btn.dataset.del));
          status('Gallery item deleted.', 'ok');
          nav('gallery');
        } catch (err) {
          status(fmtErr(err), 'err');
        }
      })();
    });
  };

  async function uploadGalleryFiles() {
    const input = $('#gallery-files');
    const files = Array.from(input.files || []);
    if (!files.length) return status('Choose image files first.', 'err');
    let ok = 0;
    for (const f of files) {
      const name = f.name;
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
        status(`Skipped ${esc(name)} — filename must be URL-safe (letters/digits/-/_/.).`, 'err');
        continue;
      }
      try {
        // upsert the storage object (created first so the public-download
        // RLS sees a published row later, not mid-upload)
        const { error: upErr } = await sb.storage.from('gallery').upload(name, f, { upsert: true });
        if (upErr) throw upErr;
        // row upsert on file — resolution=merge-duplicates keeps it single
        const { error: rowErr } = await sb.from('gallery_items').upsert(
          { file: name, caption: '', sort: 0, draft: false },
          { onConflict: 'file' },
        );
        if (rowErr) throw rowErr;
        ok++;
      } catch (err) {
        status(`Upload ${esc(name)} failed: ${fmtErr(err)}`, 'err');
        return;
      }
    }
    status(ok ? `${ok} image(s) uploaded (live). Rebuild the site to publish.` : 'Nothing uploaded.', ok ? 'ok' : 'err');
    input.value = '';
    nav('gallery');
  }

  /* ================================================================
     COLLECTIONS  (repo JSON collections managed as key → JSONB)
     ================================================================ */
  // site / nav / team / projects / resources / achievements — the
  // collections that used to be plain repo files. Each row is a payload
  // blob; the static build uses the row when present and falls back to
  // the local file otherwise. Saving here = authoring the next build.
  const COLLECTION_KEYS = ['site', 'nav', 'team', 'projects', 'resources', 'achievements'];
  views.collections = async (main) => {
    const rows = await db(sb.from('content_collections').select('key,payload,updated_at')).catch(() => []);
    const byKey = Object.fromEntries((rows || []).map((r) => [r.key, r]));
    main.innerHTML = `
      <h1 class="admin-title">Collections</h1>
      <p class="admin-sub">The <b>site</b>/<b>nav</b>/<b>team</b>/<b>projects</b>/<b>resources</b>/<b>achievements</b>
      collections that live as JSON. Each key is optional: when a row exists the build uses it as the
      source of truth; an absent row falls back to the file in the repo. Delete a row to “reset” it
      back to the repo file.</p>
      <div class="col-grid">${COLLECTION_KEYS.map(
        (key) => `<div class="panel col-card" data-key="${key}">
          <h2>${key}</h2>
          <p class="hint">${byKey[key] ? 'DB row (source of truth).' : 'Repo file (no DB row yet — click “Seed from repo” to create one).'}</p>
          <textarea class="col-editor mono" spellcheck="false" data-json>${esc(JSON.stringify((byKey[key] && byKey[key].payload) ?? null, null, 2))}</textarea>
          <div class="btn-row">
            <button class="btn primary small" data-save>Save</button>
            <button class="btn small" data-seed>Seed from repo</button>
            <button class="btn small danger" data-reset>Delete row</button>
          </div>
        </div>`,
      ).join('')}</div>`;

    // seed buttons: embed the repo files' JSON in the page (injected at
    // build time by scripts/build.js — same shape the site uses now)
    const seeds = window.ADMIN_COLLECTION_SEEDS || {};
    $$('[data-seed]', main).forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.closest('[data-key]').dataset.key;
        if (!(key in seeds)) return status(`No repo seed for "${key}".`, 'err');
        const ta = $('[data-json]', b.closest('[data-key]'));
        ta.value = JSON.stringify(seeds[key], null, 2);
        status(`Editor filled from repo "${key}.json". Save to write it.`, 'ok');
      });
    });
    $$('[data-save]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        const card = b.closest('[data-key]');
        const key = card.dataset.key;
        let payload;
        try {
          payload = JSON.parse($('[data-json]', card).value);
        } catch (e) {
          return status(`Collection "${key}" is not valid JSON: ${e.message.split('\n')[0]}`, 'err');
        }
        try {
          const { error } = await sb.from('content_collections').upsert({ key, payload }, { onConflict: 'key' });
          if (error) throw error;
          status(`Collection "${key}" saved. Rebuild the site to publish.`, 'ok');
          nav('collections');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
    $$('[data-reset]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        const card = b.closest('[data-key]');
        const key = card.dataset.key;
        if (!confirm(`Delete the DB row for "${key}"? The repo file becomes the source again.`)) return;
        try {
          const { error } = await sb.from('content_collections').delete().eq('key', key);
          if (error) throw error;
          status(`Collection "${key}" reset to repo file.`, 'ok');
          nav('collections');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  /* ================================================================
     FEATURED CONFIG
     ================================================================ */
  // drag-to-reorder lists of slugs, add/remove per box. Array order is
  // exactly what the build uses — nothing is ever sorted implicitly.
  function refBox(title, items, available) {
    const wrap = document.createElement('div');
    wrap.className = 'panel';
    wrap.innerHTML = `<h2>${esc(title)}</h2>
      ${title.indexOf('Projects') === 0 ? '<p class="hint">Home grid + projects deck are tuned for at most 3.</p>' : ''}
      <div class="ref-box" data-list></div>
      <div class="ref-add"><select data-sel></select><button type="button" class="btn small" data-add>Add</button></div>`;
    const list = $('[data-list]', wrap);
    const sel = $('[data-sel]', wrap);
    const render = () => {
      list.innerHTML = items.length
        ? items
            .map(
              (s, i) =>
                `<div class="ref-item" draggable="true" data-i="${i}"><span class="mono">${String(i + 1).padStart(2, '0')}</span> ${esc(s)} <button type="button" data-rm="${i}" aria-label="remove" style="all:unset;cursor:pointer;color:var(--ink-dim)">×</button></div>`,
            )
            .join('')
        : '<p class="empty" style="padding:.4rem">Empty — section hidden on the site.</p>';
      sel.innerHTML =
        `<option value="">add…</option>` +
        available
          .filter((s) => !items.includes(s))
          .map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)
          .join('');
      sel.disabled = sel.options.length <= 1;
    };
    render();
    let dragIdx = null;
    list.addEventListener('dragstart', (e) => {
      const it = e.target.closest('[data-i]');
      if (!it) return;
      dragIdx = Number(it.dataset.i);
      it.classList.add('is-dragging');
    });
    list.addEventListener('dragend', (e) => {
      const it = e.target.closest && e.target.closest('.is-dragging');
      if (it) it.classList.remove('is-dragging');
    });
    list.addEventListener('dragover', (e) => e.preventDefault());
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const it = e.target.closest('[data-i]');
      const to = it ? Number(it.dataset.i) : items.length - 1;
      if (dragIdx === null || to === dragIdx) return;
      const [moved] = items.splice(dragIdx, 1);
      items.splice(to, 0, moved);
      dragIdx = null;
      render();
    });
    list.addEventListener('click', (e) => {
      if (e.target.dataset.rm !== undefined) {
        items.splice(Number(e.target.dataset.rm), 1);
        render();
      }
    });
    $('[data-add]', wrap).addEventListener('click', () => {
      if (sel.value) {
        items.push(sel.value);
        render();
      }
    });
    wrap.getItems = () => items.slice();
    return wrap;
  }

  views.featured = async (main) => {
    const rows = await db(sb.from('site_config').select('config').eq('id', 1));
    const cfg = (rows && rows[0] && rows[0].config) || {
      featured: { projects: [], posts: [], resources: [] },
      home: { events: [] },
    };
    // available slugs: published posts/events from the DB; projects and
    // resources come from the build-injected catalogs (they live in
    // repo JSON, not the database)
    const [pubPosts, pubEvents] = await Promise.all([
      db(sb.from('posts').select('slug').eq('draft', false)),
      db(sb.from('events').select('slug').eq('draft', false).in('status', ['upcoming', 'ongoing'])),
    ]);
    const avail = {
      'featured.projects': PROJECT_SLUGS,
      'featured.posts': pubPosts.map((p) => p.slug),
      'featured.resources': RESOURCE_SLUGS,
      'home.events': pubEvents.map((e) => e.slug),
    };
    const boxes = {
      'featured.projects': refBox('Featured projects', [...(cfg.featured.projects || [])], avail['featured.projects']),
      'featured.posts': refBox('Featured posts', [...(cfg.featured.posts || [])], avail['featured.posts']),
      'featured.resources': refBox('Featured resources', [...(cfg.featured.resources || [])], avail['featured.resources']),
      'home.events': refBox('Home events', [...(cfg.home.events || [])], avail['home.events']),
    };
    main.innerHTML = `
      <h1 class="admin-title">Featured content</h1>
      <p class="admin-sub">Drag to reorder — the order here is exactly the display order on the site.
      Removing everything hides that section. Only published items are offered.</p>
      <div class="featured-cols" id="featured-cols"></div>
      <div class="btn-row"><button class="btn primary" id="save-config">Save configuration</button></div>`;
    const cols = $('#featured-cols', main);
    Object.values(boxes).forEach((b) => cols.appendChild(b));
    $('#save-config', main).addEventListener('click', async () => {
      const next = {
        featured: {
          projects: boxes['featured.projects'].getItems(),
          posts: boxes['featured.posts'].getItems(),
          resources: boxes['featured.resources'].getItems(),
        },
        home: { events: boxes['home.events'].getItems() },
      };
      if (next.featured.projects.length > 3) {
        return status('featured.projects is capped at 3 — the home grid breaks beyond that.', 'err');
      }
      try {
        const { error } = await sb.from('site_config').update({ config: next }).eq('id', 1);
        if (error) throw error;
        status('Configuration saved. Rebuild the site to publish it.', 'ok');
      } catch (e) {
        status(fmtErr(e), 'err');
      }
    });
  };

  /* ---------- boot ---------- */

  checkSession();
})();
