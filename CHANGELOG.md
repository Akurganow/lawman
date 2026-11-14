# Changelog

All notable changes to Lawman are listed here, newest first. The bump workflow writes each entry from the [conventional commits](https://www.conventionalcommits.org/) since the last tag. The entries up to 0.18.0 follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- - -

## v1.5.2 - 2026-11-14
#### Bug Fixes
- (**clerk**) let a reopen wait for the owner's pull request (5156c4e)
- (**clerk**) keep a source reopened after its pull request left (5729078)

- - -


## v1.5.1 - 2026-11-14
#### Tests
- share the in-process parts build and check each fill of the sync loops (6599d24)
- build the court parts and fill the sync cache once per test (a538bf2)
#### Continuous Integration
- say that the release test os list must cover the build matrix (5f6213b)
- run the test suite on macOS for every pull request (4592fe0)
- run the release tests once per operating system before any build (8f21a6b)

- - -


## v1.5.0 - 2026-11-14
#### Features
- (**clerk**) leave the owner's pull request alone and brief it after a ruling (d440171)
#### Bug Fixes
- (**clerk**) brief every open pull request of the owner and say who is the owner's (8323c78)
- (**clerk**) count a pair's pull request as Lawman's, and drop the unused error handler (abeb71b)
- (**clerk**) brief the owner's pull request itself and mark the clerk's own body (7d79f9d)
- (**journal**) end every error outside a command with one journal line (d2f23c3)
#### Tests
- (**journal**) pin the trace line in the conviction body only (f09a9c2)
#### Refactoring
- (**clerk**) make the trace one body line and keep the owner's pull request out of the pair (2238e47)

- - -


## v1.4.0 - 2026-11-14
#### Features
- (**journal**) give every role fresh host data before its alarms and input (4f77074)
#### Bug Fixes
- (**journal**) count the duty desk's failed syncs per precinct (b4cdf74)
#### Refactoring
- (**journal**) judge each alarm when its data is current (95e8a6c)

- - -


## v1.3.1 - 2026-11-14
#### Documentation
- (**readme**) restore the alt text that describes the banner (eaead3b)
- (**readme**) describe the roles, not the banner (52f26a8)
- (**readme**) say whose spec, and that not every lead ends in a pull request (cbb0e7f)
- (**readme**) redraw the banner from separate figures (6455ad2)
- (**readme**) open with a pixel-art banner and the ten roles (5c0dce0)

- - -


## v1.3.0 - 2026-11-14
#### Features
- (**spec-writer**) open the Spec with a card for the owner (e8cb485)
#### Bug Fixes
- (**spec-writer**) tie each line of the case path to its marker (afdebc9)

- - -


## v1.2.0 - 2026-11-13
#### Features
- (**journal**) write a dismissal with the precedent command (cb972d4)
- (**journal**) build the text of a dismissal file (caaadee)
- (**journal**) open a precedent pull request body without a ruling (67bd16c)
- (**journal**) give the clerk the precedent job for a dismissal (a0231b5)
- (**journal**) let law-sync fill dismissals_since (cfd04e3)
- (**journal**) read the comments of the check object (d42658a)
- (**journal**) hand a dismissal to patrol and the response unit (7da8036)
- (**journal**) match the whole finding id in seen (5b589e7)
- (**law**) remember a declined finding by a dismissal (948b381)
#### Bug Fixes
- (**assembly**) name the form of dismissals_since (1c10386)
- (**clerk**) write the issue field of the marker table without a pipe (1bb9a18)
- (**clerk**) test the lower-case state in the precedent recipe (1fbbae8)
- (**journal**) name a ruling in the body only when it changed a file (43806ee)
- (**journal**) keep a ruling's cancellation beside a dismissal that writes none (106a02c)
- (**law**) ask a lead for a difference only when patrol files for one (6cee4b9)
#### Documentation
- (**configuration**) say which forms of dismissals_since the journal reads (67736d2)
- (**law**) split three sentences over the length limit (80b296b)
- describe a precedent on the design page as the law does (cc61332)
- describe the dismissal and the whole-id answer of seen (3fd2077)

- - -


## v1.1.1 - 2026-11-13
#### Documentation
- state the rule on new tests apart from the repair rule (a606e6b)
- make the agent rules exact and name the root exception (6ecc2ac)
- add AGENTS.md with the project rules for agents (16479f7)

- - -


## v1.1.0 - 2026-11-12
#### Features
- (**law**) add the surplus department (df6d8b8)
#### Bug Fixes
- (**law**) make the surplus page exact where two readers differed (bbfe077)

- - -


## v1.0.0 - 2026-11-11
#### Features
- (**assembly**) take place, name and form of the entry from the page (fcfab39)
- BREAKING: (**assembly**) the assembly writes and proves the commands and migrates the precedents (d6e98ee)
- (**clerk**) build the pull request body from the stored ruling (8b95ea0)
- (**clerk**) say in the pull request what it is about (bd4f017)
- (**harness**) add the OpenClaw page (5d33a60)
- (**journal**) count alarms and orders in ticks (9a9d6cf)
- (**journal**) print a long clean output in parts (aab965c)
- (**journal**) print the full text of a cut case text (3471feb)
- (**journal**) cut a case text longer than one part (464d6d7)
- (**journal**) run the installation operations and move the old precedent lines (8f7ff9c)
- BREAKING: (**journal**) the journal updates itself and checks the law version (c1ed921)
- BREAKING: (**journal**) precedents as files (a65c800)
- BREAKING: (**journal**) the role entry prints the tick input (c5b555f)
- BREAKING: (**journal**) run the commands of the installation and the precincts (77be878)
- (**law**) add Parts and move outcomes to roles (2f9e29e)
- (**law**) clear law text, drop time references (d545b8c)
- (**law**) add text standard and Writing section (efc32cf)
- (**law**) define the diff view and read it first (e228301)
- BREAKING: (**law**) hand LAW.md to the roles by section (8781e2b)
- BREAKING: (**law**) the roles sync the law through the journal (94206df)
- BREAKING: (**law**) the roles read the tick input and the precedents (e35672c)
- (**precedent**) set the departments question and threshold from tuning (5810517)
- (**precedent**) the court names the departments, Jev may add to them (91c3d68)
- (**skills**) clear role skills by the standard (a90014d)
- (**spec-writer**) start a spec with a short summary for the owner (4c047b7)
- BREAKING: the duty desk works from the journal and the jobs per tick are a setting (0d98df2)
#### Bug Fixes
- (**assembly**) offer to raise the weight once the constitution has merged (5db7414)
- (**assembly**) amend a precinct that is behind with no open amendment (d02619a)
- (**assembly**) go on to the next mode and propose the parts that an update leaves (6a46de4)
- (**assembly**) read the older constitution text at its commit and show no dump (bd0dd33)
- (**assembly**) propose only what the menu choice needs (e49d187)
- (**assembly**) drop the license update that ran before every menu (03c34b1)
- (**assembly**) drop three questions and a read that decide nothing (9432558)
- (**assembly**) end amend with what happened in the run (d03ba2e)
- (**assembly**) stop offering the signature check again at every start (f62dc57)
- (**assembly**) write the missing law config line instead of offering it (e7cd1a2)
- (**assembly**) run the law sync without asking (c39b5e2)
- (**assembly**) drop the amend-now-or-later question (1977051)
- (**assembly**) take the harness that runs the session when two pages match (ff3346c)
- (**assembly**) align roles, license and harness pages with review findings (7918f16)
- (**assembly**) name the host question and limit the failed-proof step to a candidate (39b4e22)
- (**assembly**) keep the license questions as before where nothing replaced them (22f2bed)
- (**assembly**) translate a job with no entry only where the page names a form for it (35de1ab)
- (**assembly**) ask models and schedule as before, read each job's model, provider and effort (9b2c743)
- (**assembly**) state the consent, the verifier question and a failed proof once (2459b96)
- (**assembly**) return the law-facts and host-find text of the install to its base (31b2642)
- (**assembly**) return the order of calls and the reading way of a new precinct to their text (140bc3c)
- (**assembly**) keep the question of the reading way as it stands (2b4bd85)
- (**assembly**) name the constitution pull request only when one is open (d40b119)
- (**assembly**) keep the rewritten sentences within 25 words (a05ddb1)
- (**assembly**) ask the license questions only where nothing answers them (61aeaea)
- (**assembly**) propose models, schedule and limits once, translate jobs without an entry (7209dc1)
- (**assembly**) take the contract version of the draft from the contract (cea63ba)
- (**assembly**) drop the paragraph that stood twice (f77bef4)
- (**assembly**) show the count of unknown sections instead of a row each (2fdafac)
- (**assembly**) drop the access row that changes nothing (d4d1ba1)
- (**assembly**) fold the installation rows into the approval (510dcda)
- (**assembly**) drop the repository that no step asks for (744a2b0)
- (**assembly**) apply a typed weight without a second question (864d0ec)
- (**assembly**) check the constitution first in the department job and take what the inspection answers (8e51e85)
- (**assembly**) ask the old-precedent question at a re-check only on request (4787303)
- (**assembly**) tell the old-precedent facts once for the pass (569eda6)
- (**assembly**) show counts and links in the proposal instead of every row (e2bc467)
- (**assembly**) let the next start offer the weight raise after the merge (53497b5)
- (**assembly**) put the reading rows into the proposal instead of asking (ad716d2)
- (**assembly**) report the duty-desk run in one line (922a83a)
- (**assembly**) drop the consent to copy a fact into a command file (c3d3004)
- (**assembly**) find and show only the host actions the notes lack (87217ad)
- (**assembly**) keep the host limits an agent rule, not a message to the person (6d0a37e)
- (**assembly**) take the tool and the host from the notes and the remotes (74e4f43)
- (**assembly**) record the key place of TypeSafe without a question (8f10803)
- (**assembly**) write the law-version command of a plain copy instead of handing it over (4c3dad5)
- (**assembly**) read the law facts of a plain copy from the manifest and the host tool (4b3c1f0)
- (**assembly**) name the number of paid proof runs (5cccfb4)
- (**assembly**) ask the paid-run consent only when a command runs (539f05a)
- (**assembly**) use the recorded or only verifier without asking (18aee20)
- (**assembly**) stop on a failed proof instead of asking inside Apply (53ecc29)
- (**assembly**) write a command that passed its proof without a call of its own (41dd958)
- (**assembly**) take the repository host as the place of the issues (beb930a)
- (**assembly**) take the owner-attention label from the file or the host (9e211bd)
- (**assembly**) state only what the constitution pull request is (d166e5e)
- (**assembly**) ask the license calls before the approval of a new precinct (53b1b05)
- (**assembly**) name the keys a config lacks and the source of law_commit (8e6357f)
- (**assembly**) hand the roles what they apply on every run and let the journal name its stops (0581990)
- (**assembly**) the assembly syncs the law itself and says what a copy without history lacks (5d52799)
- (**assembly**) the page states the run record, and the assembly judges it (163a08d)
- (**assembly**) ask the paid-run consent before the re-proof, and judge old-form lines only on Move (9fd5932)
- (**assembly**) the roles proposal says Apply checks the translation (5433703)
- (**assembly**) the first install takes the verifier from the approved proposal (c7c7d85)
- (**assembly**) judge the verify cases by the journal's line, and state each rule once (c7f7078)
- (**ci**) stop the bump when cog finds no version tag (f39e767)
- (**clerk**) print precedent file names as they are and fail on real faults (405c674)
- (**clerk**) keep the court's words out of the pull request body (c0aa8f9)
- (**clerk**) refuse a body marker as ruling, match a standing precedent (6a6aaff)
- (**clerk**) record every ruling's precedent in its own pull request (2e48541)
- (**clerk**) count a draft only when it was opened after the ruling (7feda4c)
- (**clerk**) fail the case when trusted_login is missing at the gate (45f16e2)
- (**clerk**) let the journal give the field of the adopt marker (a519703)
- (**clerk**) read the ruling comment of the trusted login in the gate (5b7d02e)
- (**clerk**) mark adopted only for a pull request the clerk did not open (0c7e78a)
- (**clerk**) gate the new precedent paths on a Precedent line (17eebf2)
- (**clerk**) settle a handed pair whose pull request left the cache in the first tick (0382ca0)
- (**clerk**) record a conviction's precedent in its own pull request when no draft carries it (8ed3577)
- (**duty-desk**) keep rows for sections no role reads and fix the table row (8317d4f)
- (**harness**) cite the job store, the entry form and the scheduler start on the pages (d6eb047)
- (**harness**) find job models, the session and the start form on the page (f5a11a4)
- (**hermes**) the terminal record drops the last newline of the output (c56732e)
- (**hermes**) the proof reads the journal's output from the run's record, with no redirect (0817eb4)
- (**journal**) state the print path, the court referral form and the link check as the code has them (20694bc)
- (**journal**) correct five statements and remove the test runtime copy after the run (6e35aec)
- (**journal**) shrink the change to the places the defects live in (fa00c17)
- (**journal**) clean each text once, one alarm for withheld texts and for a missing constitution (664fa9e)
- (**journal**) drop the broken lead (6994344)
- (**journal**) drop the issue sync ceiling (5ea769d)
- (**journal**) read bad settings and pages as defaults and notes (b92c3b0)
- (**journal**) keep the duty desk and the alarms working through bad state (297e963)
- (**journal**) store a text that cannot be cleaned as a placeholder (a1f6d08)
- (**journal**) the role entry hands the exhibit sections to the prosecutor, the defender and the court (c56ac4d)
- (**journal**) shorten Fail texts, keep the rules (ed6209b)
- (**journal**) give each piece of a fenced block its own fence (8288631)
- (**journal**) give each part of text the fence of its own lines (239fd27)
- (**journal**) escape the mark labels and guard the role of a law read (819e5bb)
- (**journal**) count secret marks in linear time (09fd595)
- (**journal**) one update protocol for the proof, and a move that stands whole (ee332db)
- (**journal**) apply the review findings of the duty desk start (dc30f37)
- (**journal**) apply the review of the precedent files (bab68b4)
- (**journal**) close the gaps of the contract check (9038f36)
- (**journal**) take a role's input by an own key, and input_chars by the number class (06b7b25)
- (**journal**) apply the review of the role entry (69d9b87)
- (**journal**) only a file is a command, and say what the fence keeps (f2c85c2)
- (**law**) let a Hermes role remove the precedent body file with its tick folder (ae9d1c9)
- (**law**) remove the tick folder with the pull request body in it (562f34e)
- (**law**) send a whole issue out when it holds an injection (91dfcb4)
- (**law**) restore the law-version condition and clear the read-once wording (45d3d53)
- (**law**) each role skill says where the silence form and the harness forms stand (3dee6cd)
- (**law**) the lead body is stated once in the law for patrol and the response unit (68df2e5)
- (**law**) align the department row and the closing line (501f667)
- (**law**) apply the owner's answers (b8eb15e)
- (**law**) close the review findings of the pass (6415be1)
- (**law**) clarify the close and reopen sentence (c4ed139)
- (**law**) apply owner answers to ambiguous places (5e9c475)
- (**law**) apply review findings on text and tests (33490b2)
- (**law**) catch owner-named section pointers and pin the text frame (57f2b9c)
- (**law**) no pointer in the law names a section its reader lacks (cb243b3)
- (**law**) define the cut line fields and a cut part of text or clean (33a29b0)
- (**law**) no exhibits.md link names a section its reader lacks (cb70328)
- (**law**) bind the court's kinds of case to named sections (fa5cc6a)
- (**law**) apply the review of the tick input change (a9541e2)
- (**precedent**) judge a standing file by what the writer would produce (f03f5e4)
- (**precedent**) treat a file that stands with the same content as no change (2ba74c2)
- (**precedent**) accept every list prefix on an old line in an HTML block (f9e58c8)
- (**precedent**) refuse a missing line in old-precedent move before it asks (759a03e)
- (**precedent**) show an old precedent line that an HTML block holds as outside (b681f29)
- (**precedent**) the line end of a move is found without exec (c146af3)
- (**precedent**) the move cuts only its line on a page with bare CR line ends (fd5bcd8)
- (**precedent**) a second Precedents section left empty reads none (28a79ad)
- (**precedent**) the move keeps the page mode and survives a leftover temp file (c7e0ed4)
- (**test**) raise the per-test timeout for folded runs (4710d06)
- (**tick**) report every failed tick of a session (6f4ced1)
- stop the older sync on an unreadable config, and fail the fixture check (51431e1)
- name the exception in the opening of the older sync section (31e1309)
- apply the root findings of the law update (d93b92d)
- apply the review findings of the law update (95341ff)
#### Performance Improvements
- (**duty-desk**) leave the sections it never acts on out of its input (2e46c1a)
#### Documentation
- (**assembly**) keep Keep as is first in the menu, read the notes before the older text (efb6c53)
- (**assembly**) let the menu mend what an earlier release left behind (c38a1f9)
- (**assembly**) return the amend re-entry and the weight offer to their text, correct amend (81d0bba)
- (**assembly**) word the end of amend as what happened in the run (8bb7f69)
- (**assembly**) split the long menu and amend sentences (e38bfd7)
- (**assembly**) say that the Limits screen asks nothing (5053633)
- (**assembly**) the proof base keeps the proved files until their copy (91545c0)
- (**assembly**) the proof base lasts through part one of the move (df4acc5)
- (**assembly**) an old-form pull request with no moved line gets no commit (c224b96)
- (**assembly**) a proved command enters with the files it needs, unchanged (d2669cc)
- (**assembly**) the one-off proof job is the second write before approval (4f59ce7)
- (**clerk**) get the pull request body after the ruling is read (c0caede)
- (**configuration**) drop the word short from the proof of a command (5f1a4b9)
- (**constitution**) state the label question, the draft approval and the precedent question as the assembly runs them (35aad87)
- (**departments**) make the add-a-department steps one paragraph and drop the offer at add (48c6aaa)
- (**harness**) name the copy, the tools and the cut of a long line (b7e27a6)
- (**harnesses**) use the assembly's words for asking without a question tool (7543d5f)
- (**harnesses**) a section says none, a page never lacks one (feb1b56)
- (**hermes**) the entry form quotes the scripts directory (b5a9b20)
- (**journal**) remove the offer at each start and let part Host serve two stop rows (4c5c3cd)
- (**journal**) the journal and configuration pages state what the code does (920623b)
- (**journal**) describe cut texts, text and the parts of clean (d21aeee)
- (**law**) say what the clerk's pull request body holds (b10b30e)
- (**law**) restore the stop reason of the law-version step (8204d88)
- (**law**) align three sentences of the law files (7d42df5)
- (**law**) answer the review of the text pass (9b608c0)
- (**law**) meet the writing standard in the handed sections (72810f7)
- (**law**) keep the two markers.md sentences that the code contradicts (ae654d8)
- (**law**) say which Precedent lines the new paths wait for (e1d2067)
- (**law**) state the rule by which Jev adds a department (ce0d8f0)
- (**law**) state that a cancel with a name outside the class cancels nothing (3b6e704)
- (**law**) record the open facts of the cut text, the delivery route, the manual run and the decider (cd41217)
- (**law**) the law says what the journal does (f327acc)
- (**law**) a dropped court name stays only as the case department (ae070df)
- (**pipeline**) count four waits, state when contract-changed prints, name the spec summary (226e7a1)
- (**readme**) name only what the person does at install and update (08dc320)
- (**skills**) split the new sentences that ran over 25 words (9ac3cdc)
- (**skills**) the skills say what the role does where its text read two ways or pointed nowhere (8c86aae)
- (**skills**) link the law sections by file and slug (8781ccf)
- (**spec-writer**) make the example summary retell only its own sections (172dc27)
- fix the verifier stop, the contract alarm and the draft steps (12aa6fa)
- state the install access and the update order in the README (6044d96)
- note that an older Bun can hang a parallel test run (249c8f5)
- record the reasons cut from the law (757c758)
- keep the list in the gate definition open (14c4a60)
- give the exit code of a cleaner that fails on a good text (7933f26)
- keep the marks list open and agree the stage line text (0739433)
- state each fact in one place and link the other pages to it (ed28a3b)
- describe the withheld text, the constitution alarm and the alarm link (7f2e7d7)
- the README, the OpenClaw page and the assembly texts match the code (d6a8d4b)
- the contributor documents name the real checks and the real test command (9ac6fa3)
- pipeline, harness, reasons and changelog pages follow the code and the law (812bfb4)
- constitution and department pages are evidence, the journal runs proved commands (262e5be)
- add the isolation reason to the archive (590e4ed)
- bind the ask gate to the printing (cf89e49)
- assemble the moved reasons by file (8ea18f0)
- clear the documents and drop time words (aab63a6)
- clear the assembly texts by the standard (0c04875)
- make harness pages describe own harness (18a72b0)
- clear the law references by the standard (0ff6b94)
- align journal docs and skills with ticks (ac6753a)
- the court names the departments of a precedent, Jev may add (4ba67c5)
- describe the self-update of the journal and the law check (b40aa8d)
- describe the role entry, the tick start with an order and the parts (4190e16)
#### Tests
- (**alarms**) assert the new alarm line exactly (906803d)
- (**hermes**) the entry form test reads the quoted scripts path (edef818)
- (**journal**) restore the checks the removals dropped (3c88985)
- (**journal**) accept a YAML header with or without a trailing space (639d6ff)
- (**journal**) remove duplicate, text-literal and source-scan tests (42a0887)
- (**journal**) run the journal on a runtime of its own (54ce0bc)
- (**journal**) check the fence variety only when the block is cut (1a497a3)
- (**journal**) import the stop tokens of the law-update fixture at the top (f9f4443)
- (**journal**) cover the alarm repetition and the department walk of the duty desk (ff7c824)
- (**journal**) name the line arrays of the phrase test (d33e155)
- (**journal**) run the precedent alarm and input tests in process (a16483e)
- (**journal**) build the small-size role group once (0c5ce48)
- (**journal**) write the hidden characters of the hostile sample as escapes (29307e2)
- (**journal**) pin the whole refusal of a hostile stdout (9471e6b)
- (**journal**) run the hostile sample through every printed line of a command (6192979)
- (**precedent**) a hyphenated department round-trips through one question id (3b0ea34)
- fold same-named runs and drop weak checks (bbb64df)
- cover the lint-body error path and jev body (482d4fa)
- drop text, duplicate and config tests (6b740d4)
- move link forms to file#slug, add DEPARTED (150bb3d)
#### Continuous Integration
- call the package test script from both workflows (c147838)
- pin bun 1.4.3 (56abc0e)
- run the journal tests in four workers on bun 1.4.4 (eb3decd)
- BREAKING: a breaking change raises the major version (1e4ac24)
#### Refactoring
- (**clerk**) build pull request bodies without a dry run and with fewer refusals (8d27eeb)
- (**journal**) name the readers of each LAW.md section (ba34a6a)
- (**journal**) one lookup by key and one part parser (88665a0)
- (**journal**) the page walk reads the installation places itself (f3e7029)
- (**journal**) one department page walk and one consent rule (933aa23)
- (**law**) reduce the diff of the role fix (3a9cbb5)
#### Style
- follow the new Fail texts and wrap calls (e7f2474)
- format the departments tests (6b8898c)

- - -


## v0.23.1 - 2026-11-02
#### Bug Fixes
- (**law**) keep the Blockers list open, name only the normal states (e594cf1)
- (**law**) Blockers holds only what limited the tick (fa0ef13)

- - -


## v0.23.0 - 2026-11-02
#### Features
- (**law**) speak to the user in the user's language (b91b4a0)
#### Bug Fixes
- (**assembly**) merge on request, keep answers on timeout (2a94cb2)
- (**assembly**) always ask license use, true answers on cancel and consent (68d5bd3)
- (**assembly**) ask plain license questions after reading the repository (a85e499)
- (**hermes**) a manual run clears the gate so it always runs the role (0563843)
- (**journal**) a role with an order passes its run gate at every check (d0fc553)
- (**law**) apply branch review findings (a0bbc92)
- (**licenses**) write no for a repository without a license, keep row status mappings in the first check (95c6933)
#### Refactoring
- (**licenses**) the patrol reads sources, the assembly only asks consent (b012b69)

- - -


## v0.22.1 - 2026-11-02
#### Documentation
- add the license facts to LAWMAN.md (8ee37aa)

- - -


## v0.22.0 - 2026-11-02
#### Features
- (**assembly**) add the software-heritage license source row (8f75415)
- (**assembly**) add the revision-file license source row (d9abbec)
- (**assembly**) add the ubuntu license source row (d7bf764)
- (**assembly**) add the debian license source row (976fc76)
- (**assembly**) add the pub-dev license source row (bfe7ceb)
- (**assembly**) add the nimble license source row (6081ecf)
- (**assembly**) add the packagist license source row (d20e7d8)
- (**assembly**) add the homebrew license source row (8300b7f)
- (**assembly**) add the hex license source row (502ff6e)
- (**assembly**) add the conda-forge license source row (c693339)
- (**assembly**) add the cocoapods license source row (3d2af20)
- (**assembly**) add the jsr license source row (88b1a0e)
- (**assembly**) add the clearly-defined license source row (63e9c00)
- (**assembly**) add the metacpan license source row (7a011c3)
- (**assembly**) add the deps-dev license source row (0d814b0)
- (**assembly**) add the conan license source row (c77b93c)
- (**assembly**) add the opam license source row (3d89abf)
- (**assembly**) add the clojars license source row (3e6e313)
- (**assembly**) add the luarocks license source row (21784a1)
- (**assembly**) add the nuget-spec license source row (be449a0)
- (**assembly**) add the elm license source row (4e29ebd)
- (**assembly**) add the vcpkg license source row (4c6738a)
- (**assembly**) add the crandb license source row (2c21440)
- (**assembly**) add the hackage license source row (3ba4627)
- (**assembly**) add the rubygems license source row (1112160)
- (**assembly**) add the crates-io license source row (f97df2e)
- (**assembly**) add the pypi-json license source row (7d8f941)
- (**assembly**) explain the license department (2ccfc2b)
- (**assembly**) write no Departments line for licenses on amend (1374f3f)
- (**assembly**) keep the license reading entries and write the license key at install (5e71e13)
- (**assembly**) ask the license questions on the add path and update them on re-check (32fcf9e)
- (**assembly**) add the license department mode and key to the assembly (183009a)
- (**assembly**) add the license department update mode (228bd6c)
- (**assembly**) add the license department questions (a06ae25)
- (**assembly**) add the index of the license source reference (88a8bc0)
- (**assembly**) add the npm-registry license source row (7e03ad3)
- (**law**) count a license source quote of investigation as an exhibit (1aedfe8)
- (**law**) add the license source time limit to the Hermes page (2abc2d7)
- (**law**) add the rule for reading a long license text (e6c0cbb)
- (**law**) add the rule for reading a value from a source reply (93f1500)
- (**law**) add the law for reading license sources (a909d32)
- (**law**) let investigation read a license source and compare the use (82a322a)
- (**law**) tell the user what an update asks of them in the tick that synced the law (700b0ae)
- (**law**) name the Licenses section as the one exception to margin notes (b9384fb)
- (**law**) add the licenses rotation rule and source form to the department contract (f637d07)
- (**law**) point the patrol to the license reading law (57ba336)
- (**law**) state the license exceptions and the evidence of a source read (cb5014b)
- (**law**) add the licenses department page (4877654)
- (**law**) skip the licenses page without consent in the duty desk (996e6c4)
- (**law**) add the classes of the licenses source line (2b5f190)
#### Bug Fixes
- (**assembly**) let the vcpkg row ground no finding (d36ed4d)
- (**assembly**) use the cost sentence of the row in the source consent question (fc1f627)
- (**assembly**) send a vcpkg pin with an override or a version constraint to not-covered (1f92463)
- (**assembly**) define the User-Agent project address and the reading way, and trim the revision-file block (1d570b3)
- (**assembly**) correct the license source rows and drop unshipped fixture names (38764be)
- (**assembly**) count pins per visit for every row and tighten the row offer (b23cdea)
- (**docs**) state every public sample request of the live read (0ed4627)
- (**docs**) state the wrong-value rule, the User-Agent address and the licenses exception in the shared table (f1864c3)
- (**docs**) state the sources condition of license reading as the law does (4cab224)
- (**license-law**) read a wrong Licenses value one way and keep the lock visit complete (b4b71b6)
- (**license-law**) close the gaps of the reading rules and the text read (1b70a27)
- (**patrol**) open the reading rules only when the license list condition holds (70b8828)
#### Documentation
- (**assembly**) name the value classes of the npm-registry row as the law names them (716f39c)
- add the rule to ship law before code and move the update notice to the tick (ae135aa)
- record the decisions on the license department design (4e416d1)
- state that Lawman supports every harness and that a page holds differences only (6468ce0)
- describe the license key, the entry and what leaves the machine (d2ecda4)
- describe the Licenses section of the constitution (ef07014)
- describe the licenses page and its rotation rule (a76d5a7)
- describe the license department in the readme (552a2f5)
#### Tests
- let the department page tests skip folders (c70ee6f)
#### Refactoring
- (**license-law**) drop sentences that repeat the law from the tick file and role skills (ac062a1)

- - -


## v0.21.4 - 2026-11-01
#### Documentation
- limit the trusted files on the design page to the law's list (323c419)
- add the design page with goals, principles and rejected alternatives (c87aee9)

- - -


## v0.21.3 - 2026-11-01
#### Documentation
- state the update rule as a duty of the change (94cf6e8)
- require design for every user's installation (8a9e3de)

- - -


## v0.21.2 - 2026-11-01
#### Miscellaneous Chores
- remove INTENT.md (dd91055)

- - -


## v0.21.1 - 2026-10-27
#### Tests
- run the referral cases through both runners and share the minimal issues (754ced8)

- - -


## v0.21.0 - 2026-10-26
#### Features
- Hermes page shows how a role calls an expert (b9f3a13)
- Lawman takes any human ticket as a charge, and the court refers a requirement it cannot decide (549cb59)
- Jev grades requirements through a requirement brief (e071481)
- case line gains kind, answer and answer_id, and the referral stage (b535180)
- BREAKING: constitution contract version 3 (d6a6cb5)
- BREAKING: issue sync reads one object with writers, comment ids and reactions. After this update, run the assembly, open the amendment pull request it offers for each precinct, merge it, then choose Host once to rewrite host.md. (f585c3a)
#### Documentation
- any ticket, referrals, experts and the upgrade path (8db47ca)

- - -


## v0.20.0 - 2026-10-25
#### Features
- check each precinct's dependencies against the OSV catalog, run the assembly to answer the consent question (a3c0168)
- investigation reads one catalog record per lead (1802763)
- Hermes forms for sending to the catalog (9bf811b)
- assembly mode for missing catalog answers (cbdd4ab)
- catalog send rules in the exhibits (2d91013)
- journal reads catalog answers and one record per lead (7980b37)
- assembly agrees the dependency reading way per precinct (e5f0d1a)
- known vulnerabilities leave the dependencies department (41c3085)
- journal builds catalog requests in parts (be16256)
- assembly asks for catalog consent at install (a619bdc)
- a catalog match alone raises no alarm (fb74f41)
- vulnerabilities department page (7629e11)
- catalog list form and value classes in the journal (6a8e0fe)
#### Bug Fixes
- catalog mode agrees the reading way for a precinct that already said yes (b876d74)
- a catalog reply always lands on the part it was sent for (10bdd11)
#### Documentation
- Hermes page names the failed-request case (1ae658d)
- review fixes for the catalog check (c0ef3a6)
- Hermes catalog forms pass the harness command check (9eca7a4)
- catalog check, consent keys and the vulnerabilities department (956251b)
#### Refactoring
- catalog entries in their own module (3f7037c)

- - -


## v0.19.0 - 2026-10-25
#### Features
- BREAKING: margin notes and a Labels section in the constitution (f27735c)
- alarm on a pull request that waits for a decider (efb5fa8)
#### Bug Fixes
- a changed alarm detail raises a new alarm (80b0877)

- - -


## v0.18.3 - 2026-10-23
#### Bug Fixes
- reject a stateReason that is no string (a88a4dd)
- reject issue states outside the sync form (f01eaee)

- - -


## v0.18.2 - 2026-10-23
#### Performance Improvements
- find each role's last tick with a window query (00c82ef)

- - -


## v0.18.1 - 2026-10-23
#### Bug Fixes
- give the slow library-failure test 30 seconds on macOS runners (ea98607)
#### Documentation
- say a breaking change raises the minor version before 1.0.0 (f497409)
- describe the release through cocogitto and conventional commits (21d39b5)
#### Continuous Integration
- run the bump in its own workflow (011dba3)
- release with cocogitto on every merge to main (a6268e8)

- - -


## [0.18.0] - 2026-10-23

### Added

- The command `journal clean` prints host text without hidden HTML comments, secrets and hidden characters, and turns each image into a link. Roles read the bodies of issues, pull requests, comments, reviews and inline remarks, and commit messages, only through it.
- The body check finds the secrets of many providers, private key blocks, hidden characters, images and HTML comments in a role's own words.
- The journal has runtime dependencies. The lockfile pins them, and CI and the release install them with the frozen lockfile.
- The repository holds a notices file with the licences of the bundled packages.

### Changed

- `lint-body` reads the text as the host renders it, cleans quotes, prints the cleaned text on stdout and prints reasons on stderr. The host receives that output as the journal printed it.
- Patrol checks the title and the body each alone. The executor checks its commit messages.
- Every role fences a quote with a fence longer than any run of the fence character in the quote.

### Removed

- The body check no longer rejects paths, mentions, title characters, an empty title or a long body. The leak rule stays an instruction for roles.

### Fixed

- The clerk's hand-off of an adopted pull request no longer stops on its old body (#14).

## [0.17.1] - 2026-10-21

### Fixed

- The assembly verifies the real name of every model the developer names before it writes any job. The model check removed in 0.16.0 returns in this form. The agent picks the means, against the provider the job will use. A single real name that resembles the typed one counts as verified.
- When a name cannot be verified, the assembly asks: another name, the harness default, or the name as is. Several matches are listed in the question text.
- The install and roles approvals show each job's model when known.

## [0.17.0] - 2026-10-20

### Changed

- The law, the role skills, the department pages and the assembly state the result each step needs and what must not happen. They name no version-control command, no host command, query or field, and no shell utility. Only the journal's commands and the harness page's forms stay named.
- The assembly has a new part, Host. It finds the repository host, the tools that reach it and the account the host reports, with the user. It writes `host.md` in the installation: how this machine does each host action, and what is particular to the host. Roles follow these notes. The menu gains the item "Host".
- The journal's pull request and decider inputs take Lawman's own flat forms. The new command `journal form <issues|pulls|decider>` prints each form with an example, and a rejected input prints its form.
- The journal normalises every time it accepts to UTC and rejects a value that is no time.
- A repository path may have more than two segments, as in `group/sub/project`. A login may hold `.` and `_`.
- `stopped-gh-auth` is now `stopped-host-auth`.
- An installation from an earlier version needs a reinstall. Roles stop until `host.md` exists, and only the assembly writes it.
- Lawman's release carries a signed provenance file beside each journal binary. A tick checks it with the verifier the host notes name, against a trusted root from Sigstore, and needs no account on the release host. The assembly finds the verifier with the user. A user may decline it with a plain warning and turn the check on later.
- A push to the branch `release-trial` runs the release workflow without publishing a release. The run builds and signs the binaries.
- At the end of the install, the assembly offers one manual run of the duty desk and reads its record with the user. It resumes a paused duty-desk job first when the user accepts.
- Every role but the duty desk gets a run gate by default.
- The choice of repositories takes a list in free text. The clone folder is `precincts/<precinct name>`. Round two shows each repository's access as a row and runs no read probes.
- The assembly offers typical documents a repository lacks: open an issue, draft them now, or skip.

### Fixed

- A judging document is evidence. The assembly never checks its content as a department page, and never drops a department over it. A missing judging path reads as `judged by none`.
- A path that the constitution names and the ref lacks is skipped and named in Blockers. It no longer stops the role with `skipped-bad-constitution`.
- The harness page names a job by its id or its full name `[lawman] <role>`, and gives the resume form for a paused job.

## [0.16.5] - 2026-10-19

### Changed

- A repository whose constitution is already in place and passes lint joins at weight 1. A new draft still starts at weight 0 until its pull request merges.
- Whenever a weight above zero is set and a job is paused, the assembly offers to resume it. A declined offer comes back at the next weight.

## [0.16.4] - 2026-10-19

### Fixed

- The code span pattern of the body lint holds no form that the Hermes plugin scanner rates as an inline shell snippet. That rating blocks a plugin update. CI now runs the scanner of the newest Hermes on every push and pull request.
- An escaped backtick no longer opens a code span in the body lint, so an image after it is caught again.
- "Add a department" sends a change of a reused installation page back to the choice of the place.
- The law says that a stopped tick of the duty desk is delivered.

## [0.16.3] - 2026-10-19

### Changed

- A tick that succeeds, skips or stops answers only the silence form. Its report stays in the journal. Only alarms, failures and stops of the law sync or the duty desk reach the delivery routes.

### Fixed

- The body lint no longer reads a quoted `vec![...]` or another `![` inside code as an image embed. Investigation stopped on such quotes from Rust code.

## [0.16.2] - 2026-10-19

### Fixed

- The install downloads the journal and `SHA256SUMS` into a temporary folder and checks them. It moves the journal to `bin/journal` and removes the folder, so no checksum file stays in `bin/`.

## [0.16.1] - 2026-10-19

### Fixed

- A restarted install downloads the journal again over the files a stopped run left.
- A restarted amend skips a precinct whose amendment pull request is still open.
- "Add a department" reuses an existing installation page and never overwrites it.

## [0.16.0] - 2026-10-19

### Changed

- The assembly asks through the harness's own question tool, with choices. It proposes each part of the setup in one message, and the developer approves before it writes.
- Delivery routes come as choices that the harness lists. A file-only route says that alarms stay in files.
- The assembly finds whether the TypeSafe key is in place and never reads its value.
- Explanations moved to `skills/assembly/references/explain.md`. The assembly reads them only when the developer asks.

### Removed

- The delivery test, the scheduled-session probe, the silence probe and the paid key probe.
- The model check.
- The release repository confirm.

## [0.15.0] - 2026-10-19

### Added

- The assembly asks where the installation lives. The default is the working directory of an existing `[lawman]` job, else `~/.lawman`. It creates the folder and the `lawman` link to the plugin folder.
- Documentation: a restructured README, `CONTRIBUTING.md`, this changelog, and the pages `docs/pipeline.md`, `docs/harnesses.md`, `docs/configuration.md`, `docs/journal.md`, `docs/departments.md`, `docs/constitution.md` and `docs/precinct-departments.md`.
- `docs/harnesses.md` records the layout that serves eight harnesses. The README lists Kiro, OpenClaw, Pi, Oh-My-Pi, Claude Code, Codex and GitHub Copilot CLI as TBD.

### Changed

- The journal program moved to `journal/`, with its `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `entitlements.plist` and `src/`.
- Hermes Agent installs Lawman with `hermes plugins install Akurganow/lawman --enable`. The repository root holds no `package.json`, so the install asks no dependency question and needs no `--no-deps`.
- A Hermes user starts the assembly in a chat with `/agent-plugin-lawman-492e59eb:assembly`.
- CI and the release workflow run in `journal/`.
- The test that compares `wake` with the order the dispatcher takes runs in process.

## [0.14.0] - 2026-10-18

- Lawman became an Agent Plugins package. `plugin.json` and a marketplace file sit at the root. The law, the shared department pages and the harness page moved under `skills/lawman-law/`.
- The assembly installs from the plugin and amends precinct constitutions after an update. It asks which TypeSafe key the court uses and where it lives, and records the place, never the value.
- Every tick starts by syncing the law. A role that finds a new release downloads and verifies its journal and lets it complete the installation. The new `law-sync` command rewrites `config.yaml`.
- `main` receives only tagged releases.

## [0.13.0] - 2026-10-18

- The assembly teaches the roles, the models and the schedule before it asks about them.
- The new `wake --role <r>` command prints `idle` or the orders a role can take. A run gate built on it skips sessions with no work.

## [0.12.0] - 2026-10-18

- Lawman became a precinct of itself, with an `internal-affairs` department.
- The new `tick list` command reads tick outcomes and reports.
- A precinct's own department page can name source commands.

## [0.11.1] - 2026-10-18

- Fixes for the defects that a live-run audit found.
- The exhibit rules moved into one shared file, and the skills got shorter.

## [0.11.0] - 2026-10-17

- The court can ask TypeSafe Jev for priority evidence about a conviction.

## [0.10.0] - 2026-10-17

- The executor takes a pull request whose newest spec a maintainer approved, writes the change in the branch and marks the pull request ready.
- The journal tracks the executor's turn on each pull request.

## [0.9.0] - 2026-10-17

- The court sets a priority from P0 to P3 on a conviction.
- The clerk opens draft pull requests for convictions and adopts open pull requests of the trusted login.
- The new spec writer writes one `Spec` comment per pull request. A maintainer votes on it with a 👍 or 👎.
- The journal moves to schema 4. An older binary rejects the new outcome tokens.

## [0.8.0] - 2026-10-16

- Ten shared department pages ship with the law.
- A department visits a precinct about once every D patrol ticks, where D is the number of the precinct's departments.
- The assembly can add a department to a precinct after founding.
- Every scheduled job name starts with `[lawman]`.

## [0.7.0] - 2026-10-16

- The response unit turns an issue a human filed into a lead comment, asks the reporter one question, or sends the issue out.
- The new `intake` command lists issues that wait for the response unit.

## [0.6.0] - 2026-10-16

- The shared tick steps moved into one file that every role reads.
- The assembly updates the installation to a release tag.
- The `pause` command is gone.

## [0.5.0] - 2026-10-16

- The clerk opens a pull request for a ruling's precedent and leaves a marker comment.
- Every role uses one identity.

## [0.4.0] - 2026-10-16

- The court takes one order on a defended case and rules conviction or acquittal.
- An older journal binary rejects the outcomes `convicted` and `acquitted`, so update the installation before the first court tick.

## [0.3.0] - 2026-10-15

- The defender argues against a charge with a defence, a return or a refutation.
- The journal routes a charged case to the defender.

## [0.2.2] - 2026-10-15

- A successful tick answers the silence token. Only alarms, failures and stops reach the delivery platform.

## [0.2.1] - 2026-10-15

- The duty desk syncs every weighted precinct before it writes stage orders.

## [0.2.0] - 2026-10-15

- The investigation and the prosecutor roles, with the `case` and `due` commands.
- The journal split into modules. CI runs Biome and a strict type check before the tests.

## [0.1.2] - 2026-10-15

- The release workflow checks the package version against the tag.
- The journal closes four findings from an inspection.

## [0.1.1] - 2026-10-15

- The assembly proposes a daily default schedule and checks the harness turn limit.
- Lawman sets no cron cap and no time budget. Harness settings change only through the harness's own commands.
- A role can run once through `hermes cron run`, which Hermes records.

## [0.1.0] - 2026-10-14

- The first release: the law, the journal, the duty desk, patrol, the assembly and the Hermes Agent harness page.
- CI with a fence for repository-specific words. A release workflow builds four binaries, signs the macOS ones ad hoc and publishes checksums.

[0.18.0]: https://github.com/Akurganow/lawman/compare/v0.17.1...v0.18.0
[0.17.1]: https://github.com/Akurganow/lawman/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/Akurganow/lawman/compare/v0.16.5...v0.17.0
[0.16.5]: https://github.com/Akurganow/lawman/compare/v0.16.4...v0.16.5
[0.16.4]: https://github.com/Akurganow/lawman/compare/v0.16.3...v0.16.4
[0.16.3]: https://github.com/Akurganow/lawman/compare/v0.16.2...v0.16.3
[0.16.2]: https://github.com/Akurganow/lawman/compare/v0.16.1...v0.16.2
[0.16.1]: https://github.com/Akurganow/lawman/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/Akurganow/lawman/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/Akurganow/lawman/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/Akurganow/lawman/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/Akurganow/lawman/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/Akurganow/lawman/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/Akurganow/lawman/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/Akurganow/lawman/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/Akurganow/lawman/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Akurganow/lawman/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Akurganow/lawman/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Akurganow/lawman/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Akurganow/lawman/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Akurganow/lawman/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Akurganow/lawman/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Akurganow/lawman/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/Akurganow/lawman/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Akurganow/lawman/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Akurganow/lawman/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/Akurganow/lawman/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Akurganow/lawman/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Akurganow/lawman/releases/tag/v0.1.0
