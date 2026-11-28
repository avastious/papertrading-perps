# The Day Email Stopped: beat sheet (step 3, version 1)

99 beats · 1806 words · about 14 minutes at 150 words a minute with a breath per beat.

**Link** says how each beat follows the one before: **BUT** (a complication) or **THEREFORE** (a consequence). The narration itself never says "but", "therefore" or "and then".

**Flag:** FACT = named source · REPORTED = secondhand or sources disagree · STORY = invented scene or character · ANALYSIS = our reading · GENERAL = common knowledge, not checked for this video · **LEGEND = folklore, not fact**.

## Sets

- **TRADE**: Trading floor (Asia desk / London desk by changing the signs and the light)
- **OFFICE**: Open-plan office (Penny's desk, Sam's IT corner, whiteboard)
- **DOOR**: The Front Door: hotel-style lobby with Gate, rows of doormen behind, lifts up to the mailboxes
- **CITY**: City street (day or night): courthouse, city hall, hospital, a domed parliament, all generic
- **MAP**: World map (flat graphic, dots and pins)
- **HALL**: Mail hall: the waiting room where undelivered envelopes queue
- **CARD**: Cards: title, quote and flashback cards (no real people drawn)

## Cold open

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 1 | OPEN | Friday the thirteenth of November, 2026. In a finance office in Taiwan, a machine nobody has touched in years shrieks to life. | 22 | Dusty Faxie in a corner. Lights blink, screech lines burst out, everyone turns. | TRADE | Fri 13 Nov 2026 · Taiwan | STORY / REPORTED | HR |
| 2 | THEREFORE | Traders gather round it, because this beige box from the nineties is now the only way they can confirm their trades. | 21 | Bigsby and traders huddle over Faxie as one sheet of paper inches out. | TRADE |  | REPORTED | HR BB |
| 3 | BUT | Not every firm has a fax. Another Taiwanese finance company simply cancels a bond deal it can no longer finish. | 20 | A trader stamps CANCELLED across a deal ticket. | TRADE | Bond repurchase: CANCELLED | REPORTED | HR |
| 4 | BUT | This is no local glitch. The same silence has spread across dozens of countries since the night before. | 18 | World map. Office dots go grey one after another. | MAP |  | FACT | AJ |
| 5 | THEREFORE | Courts stop receiving email. In Britain, even the Supreme Court tells the public its inbox has gone quiet. | 18 | A grand courthouse with tape over its letterbox. | CITY |  | FACT | ABC |
| 6 | THEREFORE | Somewhere in the middle of all this, an ordinary office worker is still pressing send, over and over. | 18 | Penny clicks Send again and again. A spinner turns on her screen. | OFFICE |  | STORY |  |
| 7 | BUT | Nothing is wrong with her computer. The problem is one door, far away, that every one of her emails must pass through. | 22 | Her envelope runs along a cable to a giant door with Gate standing in front. | DOOR |  | FACT (simplified) | LAM |
| 8 | THEREFORE | So how does one hidden bug, sleeping quietly since July, lock that door and switch off the world's inbox for a whole day? | 23 | Gate asleep on his feet. A tiny bug snores inside his cap. Title card. | CARD | THE DAY EMAIL STOPPED | REPORTED | AIW O365 |

## Act 1 · How an email travels

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 9 | THEREFORE | To answer that, start where Penny's email starts: one click, and one small envelope leaving her laptop. | 17 | The envelope pops out of the laptop, sprouts legs and stretches. | OFFICE |  | STORY |  |
| 10 | BUT | Her email doesn't fly straight to the person she's writing to. It has to visit Microsoft's computers first. | 18 | The envelope reaches a signpost: one arm says THE CLOUD, the other says (NOT AN ACTUAL CLOUD). | OFFICE |  | GENERAL |  |
| 11 | THEREFORE | Those computers are called Exchange Online. They hold the mailboxes for a huge number of the world's businesses. | 18 | A vast hall of mailboxes stretching to the horizon. | DOOR | Exchange Online | GENERAL |  |
| 12 | BUT | Nobody walks straight into Exchange Online. Every connection comes in through a layer of gateway servers out front. | 18 | Pull back to a grand hotel entrance with a revolving door. Gate stands at it. | DOOR | Gateway servers | FACT | LAM |
| 13 | THEREFORE | Think of them as doormen. Gate checks each visitor, finds the right floor, and sends them up to the right mailbox. | 21 | Gate tips his hat and points envelopes into the lifts. | DOOR |  | STORY (metaphor) |  |
| 14 | BUT | Gate doesn't only work for email. Teams chats, shared files and other Microsoft 365 services use the same front door. | 20 | Chat bubbles and paper folders queue up beside the envelopes. | DOOR |  | FACT | LAM |
| 15 | THEREFORE | So there isn't one doorman. There are long rows of them, in data centres around the world, sharing the load. | 20 | Camera pulls back: rows and rows of identical Gates. | DOOR |  | GENERAL (number not public) |  |
| 16 | BUT | Some services can step around a busy doorman and use a side door. Exchange Online can't. | 16 | A chat bubble slips through a side door. An envelope walks into a brick wall. | DOOR |  | FACT | LAM |
| 17 | THEREFORE | If the doormen stop answering, email has nowhere else to go. Remember that, because it matters later. | 17 | The envelope sits on the front step, chin in hands. | DOOR | No side door for email | FACT | LAM |
| 18 | BUT | For years it all worked so smoothly that most people never gave the front door a single thought. | 18 | Penny sips coffee while envelopes zip in and out like clockwork. | OFFICE |  | STORY |  |

## Act 2 · The sleeping bug

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 19 | BUT | In July 2026, a routine software update reached the gateway servers. Hidden inside it was a mistake. | 17 | A van drops a box marked UPDATE · JULY at the door. A tiny bug peeks out. | DOOR | July 2026 | REPORTED | AIW |
| 20 | THEREFORE | Microsoft later called it a latent defect: a bug that sits quietly and only bites under particular conditions. | 18 | The bug curls up and falls asleep inside Gate's cap. | DOOR | latent: present, but hidden | FACT | LAM IH |
| 21 | BUT | It wasn't in the email software at all. Microsoft's final report traced it to Windows, on the gateway servers themselves. | 20 | Inside Gate's chest: gears turning, one cog slightly sticky. | DOOR |  | REPORTED | GR |
| 22 | THEREFORE | The Register reported a lock-contention bug: too many workers queueing for one key at the same moment. | 17 | Lots of little robot hands reach for a single key on a hook. | DOOR | LOCK CONTENTION | REPORTED | AIW |
| 23 | BUT | That queue only gets long on machines with many processor cores, all grabbing for the key at once. | 18 | A crowd of tiny chips with legs jostles round the hook. | DOOR |  | REPORTED | AIW |
| 24 | THEREFORE | Microsoft's load testing reportedly didn't cover that kind of high-core hardware, so the bug sailed through every check. | 18 | An inspector ticks boxes on a clipboard. The bug hides underneath it. | DOOR |  | REPORTED | AIW |
| 25 | BUT | For more than three months, nothing happened. The update ran worldwide, and email flowed exactly as normal. | 17 | Calendar pages flip from July to November while envelopes stream past. | DOOR | Jul → Nov | REPORTED | LAM SO |
| 26 | THEREFORE | Everyone had good reason to think the July update was safe. The bug was simply waiting for its moment. | 19 | Close on the sleeping bug. One eye opens. | DOOR |  | ANALYSIS |  |

## Act 3 · The trigger

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 27 | BUT | About fifteen hours before the outage, something routine happened somewhere else in Microsoft's network. | 14 | A distant control-room light turns from green to amber. | DOOR | −15 hours | REPORTED | PIR |
| 28 | THEREFORE | Teams traffic failed over onto the main gateway, the very same front door Exchange Online depends on. | 17 | A herd of chat bubbles is shepherded into Gate's lobby. | DOOR | Teams → main gateway | REPORTED | PIR |
| 29 | BUT | Failovers like that are everyday events. Microsoft says this kind had never caused trouble for email before. | 17 | Gate shrugs, completely unbothered. | DOOR |  | REPORTED | PIR |
| 30 | BUT | This time there was a difference. Fewer gateway servers than usual were on duty to share the work. | 18 | Half the doormen in the row are missing; empty spots on the floor. | DOOR |  | REPORTED | AIW |
| 31 | THEREFORE | Fewer doormen meant more visitors for each one, and more processor cores fighting over that single key. | 17 | The lobby packs tight. Gate starts sweating. | DOOR |  | ANALYSIS (simplified) | AIW |
| 32 | THEREFORE | Microsoft described three factors lining up together: the hidden defect, a shift in traffic, and extra load. | 17 | Three dominoes stand in a row, each with a label. | CARD | 1 hidden defect · 2 traffic shift · 3 extra load | REPORTED (sources word these differently) | LAM OST AIW |
| 33 | BUT | None of the three was dangerous alone. Together, at 16:20 UTC on Thursday the twelfth, they knocked Gate out. | 19 | The dominoes fall. Gate freezes mid hat-tip. | DOOR | 16:20 UTC · Thu 12 Nov | FACT | O365 IH |
| 34 | THEREFORE | The doormen didn't explode or catch fire. They simply stopped answering, frozen in place, waiting for that key. | 18 | Gate's LED eyes turn into tiny hourglasses. | DOOR |  | ANALYSIS (simplified) | AIW |
| 35 | THEREFORE | In the Americas it was late morning. Outlook began timing out there, and within about half an hour, the problem was global. | 22 | Map: the Americas go grey first, then the grey sweeps around the globe. | MAP |  | FACT | TE MS |

## Act 4 · The world notices

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 36 | THEREFORE | Back at her desk, Penny's email sits in the outbox. The little envelope just stands there, tapping its foot. | 19 | The envelope taps its foot in an outbox tray. | OFFICE |  | STORY |  |
| 37 | BUT | Penny wasn't alone. Within about an hour, the tracking site Downdetector had reports from 74 countries and territories. | 18 | Map fills with 74 red pins. | MAP | 74 countries & territories in ~1 hour | FACT | AJ |
| 38 | THEREFORE | In the United States, Outlook problem reports passed 130,000 by early afternoon, according to Reuters. | 15 | A counter spins past 130,000. | MAP | 130,000+ reports | REPORTED (counts vary by outlet) | REU |
| 39 | BUT | It wasn't only email. Teams, SharePoint and Copilot stumbled too, because they shared Gate's front door. | 16 | Chat bubbles, folders and a little sparkle icon all stuck at the door. | DOOR |  | FACT | AJ LAM |
| 40 | THEREFORE | In the IT corner of Penny's office, Sam's phone starts buzzing, and it doesn't stop. | 15 | Sam's phone vibrates across the desk and off the edge. | OFFICE |  | STORY |  |
| 41 | BUT | Sam can't fix it. The fault isn't anywhere in their building. It's deep inside Microsoft's network, far out of reach. | 20 | Sam presses against a glass wall. Far behind it, frozen Gate. | OFFICE |  | STORY (true of customer IT teams) |  |
| 42 | THEREFORE | All Sam can do is keep refreshing Microsoft's status page, where the problem has a code: EX1550543. | 17 | Sam's laptop shows a plain status page (generic, no logos). | OFFICE | EX1550543 | FACT | MS |
| 43 | BUT | A status page can't file a court case. Across America, lawyers started asking judges for more time. | 17 | A lawyer holds up a calendar to a judge's bench. | CITY |  | FACT | ABC |
| 44 | THEREFORE | In Austin, Texas, city staff couldn't send or receive email. Baltimore said its city email was delayed. | 17 | A city hall whose mailbox flag is stuck down. | CITY | Austin · Baltimore | FACT | ABC |
| 45 | THEREFORE | In Washington, one congressional staffer told Axios the legislative branch was paralyzed. | 12 | A domed building with a frozen clock on the front. | CITY |  | REPORTED | AX |
| 46 | BUT | Hospitals and universities were hit as well, though Toronto's Unity Health said patient care wasn't affected. | 16 | Hospital front. A nurse calmly reads a paper chart. | CITY |  | FACT | ABC |
| 47 | THEREFORE | The Supreme Court of the Philippines said it was affected. In Japan, some government offices reportedly went back to paper. | 20 | Towers of paper forms with ink stamps. | CITY | Philippines · Japan | REPORTED | ABC |
| 48 | BUT | Every crisis attracts opportunists. Banks warned customers that scammers might use the outage to send fake emails. | 17 | A shady envelope in a fake moustache sneaks along the wall. | CITY | Phishing warning | REPORTED | CNN |
| 49 | THEREFORE | Microsoft was quick to make one thing clear: it had seen no sign that this was a cyberattack. | 18 | Quote card. | CARD | "No indication of malicious activity" | FACT | LAM CNN |
| 50 | BUT | Online, the usual suspects got the blame anyway: hackers in hoodies, or a tired intern tripping over a cable. | 19 | Rumour bubbles: a hooded hacker, an intern falling over a cable. | CITY | RUMOUR | LEGEND (stock outage folklore, no evidence here) |  |
| 51 | THEREFORE | Neither story holds up. No villain pulled a plug. A bug had waited months for exactly the right traffic. | 19 | The rumour bubbles pop. The bug waves sheepishly. | DOOR |  | FACT | LAM AIW |
| 52 | THEREFORE | Inside Microsoft, engineers raced to wake the frozen doormen. The obvious move was to undo the faulty change. | 18 | Faceless engineer silhouettes haul on a huge lever marked UNDO. | DOOR |  | STORY / REPORTED | AIW |

## Act 5 · The fix that failed

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 53 | BUT | Reports say a standard rollback wasn't possible, with more than eight in ten gateway servers unresponsive at the peak. | 19 | The lever snaps off in their hands. | DOOR | 80%+ unresponsive | REPORTED (secondhand figure) | AIW SO |
| 54 | THEREFORE | So the engineers had to build a fix and roll it out while the outage was still happening. | 18 | Engineers hammer a patch together in a tent pitched outside the door. | DOOR |  | REPORTED | AIW |
| 55 | BUT | The first attempt didn't hold. Microsoft admitted its recovery steps weren't working as expected. | 14 | The patch peels off Gate like a bad plaster. | DOOR | "not going as expected" | FACT | ENCA NW |
| 56 | THEREFORE | Here's why recovery dragged: whenever a doorman woke up, a huge crowd of waiting traffic rushed him all at once. | 20 | Gate opens his eyes. A stampede of envelopes and chat bubbles charges. | DOOR |  | REPORTED | NW |
| 57 | THEREFORE | Overwhelmed, he froze again. Engineers call this a thundering herd: each revived server gets trampled straight back down. | 18 | Gate flattened, cartoon footprints across him. | DOOR | THUNDERING HERD | REPORTED (the label is the industry term, ours) | NW |
| 58 | BUT | The world kept to its own clock. As America headed home, Asia was waking up to empty inboxes. | 18 | Split street: offices going dark on one side, sunrise on the other. | CITY |  | FACT (time zones) |  |
| 59 | THEREFORE | That's how Friday the thirteenth began in Tokyo and Taipei: no email, and markets about to open. | 17 | Asian trading floor at dawn, screens flickering on. | TRADE | Tokyo · Taipei | STORY / FACT | HR BB |
| 60 | BUT | On the day of the outage, a Microsoft social account was cheerfully asking followers for their best AI tips. | 19 | A bright post bubble on a phone: SHARE YOUR BEST AI TIP! | CARD |  | REPORTED | WL |
| 61 | THEREFORE | The top reply, reported by Windows Latest, read: make sure that your product doesn't fail. | 15 | The reply bubble swells as likes pile on. | CARD | "make sure that your product doesn't fail" | REPORTED | WL |
| 62 | BUT | In finance, jokes don't settle trades. Every deal needs a confirmation, and confirmations normally travel by email. | 17 | Bigsby holds a deal ticket, sweating. | TRADE |  | GENERAL |  |

## Act 6 · The fax comeback

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 63 | THEREFORE | One London broker told reporters the outage hurt the processing of trades more than the making of them. | 18 | Finished trades stack up on Bigsby's desk into a wobbling tower. | TRADE |  | REPORTED | HR |
| 64 | THEREFORE | So in Japan and Taiwan, some firms reached for the one tool that doesn't need Microsoft at all. | 18 | Bigsby opens a storage cupboard. Faxie blinks in the light. | TRADE |  | REPORTED | HR BB |
| 65 | BUT | Faxie is hardly new technology. Sending images down a wire was first patented in 1843. | 15 | Sepia flashback: a Victorian workshop with a pendulum gadget (no real person shown). | CARD | 1843 | GENERAL (not checked for this video) |  |
| 66 | THEREFORE | That makes the fax older than the telephone, which came along in 1876. Faxie finds this hilarious. | 17 | Faxie laughs so hard it spits out paper. | TRADE | 1843 vs 1876 | GENERAL (not checked for this video) |  |
| 67 | BUT | Japan is famous for loving the fax. That's partly legend: its government has spent years trying to retire it. | 19 | A row of fax machines under a RETIREMENT PARTY banner. | TRADE |  | LEGEND (a stereotype, partly true) |  |
| 68 | THEREFORE | On this Friday, the joke turned useful. Bloomberg reported Japanese firms confirming trades by fax. | 15 | A fax header reads CONFIRMED. | TRADE |  | REPORTED | BB |
| 69 | THEREFORE | Bigsby feeds in a trade confirmation. Faxie screeches, whirs, and slowly prints a reply. The deal is done. | 18 | Paper slides out with a big tick on it. Bigsby punches the air. | TRADE |  | STORY |  |
| 70 | BUT | A fax only helps if the other side still owns one. Plenty didn't, so they picked up their phones instead. | 20 | Bigsby with a phone at each ear. | TRADE |  | REPORTED | DAWN |
| 71 | BUT | Back at the front door, engineers finally had a patch that reverted the defective change. It rolled out on the thirteenth. | 21 | Engineers carry the bug out in a jam jar. | DOOR |  | REPORTED | AIW |

## Act 7 · The doors reopen

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 72 | THEREFORE | This time the fix held. By Friday afternoon, Microsoft reported signs of stabilisation as it rolled the fix out wider. | 20 | Gate stretches, cracks his knuckles, and reopens the revolving door. | DOOR |  | FACT | GMA |
| 73 | THEREFORE | Microsoft's timeline puts the end of the impact at 16:10 UTC that Friday: twenty-three hours and fifty minutes after it began. | 21 | A big stopwatch clicks to a stop. | CARD | 23 h 50 min | FACT | O365 IH |
| 74 | BUT | Open doors didn't mean delivered mail. A whole day of email was still stuck in waiting rooms around the world. | 20 | A hall piled to the ceiling with envelopes. | HALL |  | FACT | SMTP |
| 75 | THEREFORE | When a mail server can't deliver a message, it normally holds on to it and tries again later. | 18 | Envelopes take numbered tickets, like a deli counter. | HALL |  | GENERAL |  |
| 76 | BUT | Exchange Online normally gives up after about 24 hours. A day-long outage could have bounced a mountain of mail. | 19 | A wall clock. Envelopes stare up at it nervously. | HALL | 24 h | FACT | AIW WF |
| 77 | THEREFORE | Microsoft stretched that retry window from 24 to 48 hours, buying the waiting mail an extra day. | 17 | Someone pulls the clock's hands apart like taffy. | HALL | Retry window: 24 h → 48 h | FACT | AIW WF |
| 78 | THEREFORE | One email company said that of roughly 3.6 million messages it was sending, about 16,000 were still waiting to retry. | 20 | A departures board: 3.6M SENT · 16,000 WAITING. | HALL | 3.6 million · 16,000 waiting | REPORTED (one provider's figures) | SMTP |
| 79 | BUT | Slowly, the queues drained. Penny's envelope finally gets its turn, waves goodbye, and rides the lift upstairs. | 17 | The envelope waves from a closing lift door. | DOOR |  | STORY |  |
| 80 | THEREFORE | Microsoft says all queued business email was delivered in the end, and it found none permanently lost. | 17 | A tower of mailboxes, every little flag popping up. | DOOR |  | FACT | GR |
| 81 | BUT | Some people were less lucky. Consumer accounts left unused for over 30 days had some delayed messages expire. | 18 | A dusty home mailbox. An envelope fades away. | HALL | Inactive 30+ days | FACT | GR |
| 82 | THEREFORE | Their senders got bounce notices instead, the email version of a letter stamped return to sender. | 16 | An envelope gets a red RETURN TO SENDER stamp. | HALL | Non-delivery report | FACT | GR |
| 83 | BUT | Mail wasn't the only thing held up. Some of the security checks that guard inboxes slowed down too. | 18 | A security guard with a magnifying glass, asleep in his chair. | DOOR |  | FACT | GR |
| 84 | THEREFORE | A feature that pulls dangerous emails back after delivery ran late, and some protected links wouldn't open. | 17 | The guard wakes and chases a sneaky envelope that is already inside. | DOOR | Zero-hour auto purge · Safe Links | FACT | GR |
| 85 | THEREFORE | Microsoft formally closed the incident early on Saturday the fourteenth, roughly thirty-six hours after it began. | 16 | The status page flips to green. Sam slumps with relief. | OFFICE | Resolved · Sat 14 Nov | REPORTED (end times differ by source) | FAN |
| 86 | BUT | Fixing the service didn't answer what everyone was asking: how can email fail like this, at this scale? | 18 | Every character, side by side, with a question mark above each head. | CARD |  | ANALYSIS |  |

## Act 8 · What went wrong

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 87 | THEREFORE | Microsoft published a preliminary report within days, followed by a final report around the twentieth of November. | 17 | Two documents slide onto a desk (plain covers, no logos). | CARD | Preliminary · Final | REPORTED (dates differ) | O365 WF |
| 88 | THEREFORE | Charles Lamanna, the executive whose team runs the platform, posted: we are deeply sorry for the impact to all our customers. | 21 | Quote card only. No portrait. | CARD | "We are deeply sorry for the impact to all our customers" | FACT | LAM |
| 89 | BUT | The reports didn't describe one careless mistake. They described a chain: a hidden bug, a routine traffic shift, and too little spare capacity. | 23 | The three dominoes again, now joined by a chain. | CARD |  | REPORTED | LAM AIW |
| 90 | THEREFORE | The deeper weakness was the design. Email had one front door, and no way around it when that door jammed. | 20 | Bird's-eye view: one door, one wall, no side path. | DOOR |  | ANALYSIS | LAM |
| 91 | THEREFORE | The Register summed up the final report in one headline: testing gaps, and emails that never arrived. | 17 | A newspaper slaps onto the floor. Headline shown generic. | CARD | Testing gaps · Emails that never arrived | REPORTED | REG |
| 92 | BUT | It wasn't even Microsoft's only email trouble that month. A week earlier, a faulty spam filter bounced good mail to Outlook.com and Hotmail. | 23 | Earlier calendar page. A grumpy filter flicks envelopes away. | CARD | 6–9 Nov · EX1545193 | REPORTED | GR |
| 93 | THEREFORE | Two email failures in one week left plenty of businesses asking an uncomfortable question: what is our plan when email stops? | 21 | Penny's office: everyone looks at Sam. | OFFICE |  | ANALYSIS |  |
| 94 | THEREFORE | Sam writes an answer on the whiteboard: a phone tree, a backup chat channel, and a printed list of contacts. | 20 | Whiteboard list being written. | OFFICE | Phone tree · Backup channel · Printed contacts | STORY |  |
| 95 | BUT | Sam adds one more line at the bottom that nobody expected: check that the fax machine still works. | 18 | The new line on the board. Faxie, at the door, beams. | OFFICE | Check the fax machine | STORY |  |
| 96 | THEREFORE | Penny's email lands at last, more than a day late. It says: quick question, is your email working? | 18 | The email opens on the recipient's screen. Penny facepalms. | OFFICE | "Quick question, is your email working?" | STORY |  |

## Ending

| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |
|---|---|---|---|---|---|---|---|---|
| 97 | BUT | Most people forgot about it within a week. Email went back to being invisible, the way good plumbing is. | 19 | Envelopes zip about as before. Nobody looks up. | OFFICE |  | ANALYSIS |  |
| 98 | BUT | Gate is back at his post, tipping his hat to every envelope, as if nothing ever happened. | 17 | Gate at the revolving door. A faint jam-jar shape on the shelf behind him. | DOOR |  | STORY |  |
| 99 | THEREFORE | Somewhere in Taipei, a beige machine has been moved out of the cupboard, onto a desk, and plugged back in. Just in case. | 23 | Faxie on a desk, power light on, one eye winking. Fade out. | TRADE | THE DAY EMAIL STOPPED · 12–14 Nov 2026 | STORY |  |

## Sources

- **AJ**: [Al Jazeera, 13 Nov](https://www.aljazeera.com/news/2026/11/13/microsoft-hit-by-global-outages-what-happened-and-why)
- **ABC**: [ABC News: governments, courts, hospitals, universities](https://abcnews.com/Business/microsoft-outlookoutage-impacts-governments-courts-hospitals-universities/story?id=138107029)
- **AX**: [Axios: courts and Congress, 13 Nov](https://www.axios.com/2026/11/13/microsoft-outage-hits-courts-congress)
- **CNN**: [CNN live coverage, 12 Nov](https://www.cnn.com/2026/11/12/business/live-news/microsoft-global-outage-intl-hnk)
- **REU**: [Reuters via TechRepublic (130,000 reports)](https://www.techrepublic.com/article/news-microsoft-outlook-outage-130000-reports-2026/)
- **HR**: [Hromadske citing Reuters (Taiwan fax, bond deal, London broker)](https://hromadske.ua/en/amp/technology/274318-microsoft-outage-disrupts-governments-and-businesses-worldwide-forces-traders-back-to-fax-machines)
- **BB**: [Brit Brief citing Bloomberg (Japan fax)](https://britbrief.co.uk/business/tech/microsoft-outage-forces-traders-back-to-fax-machines.html)
- **DAWN**: [Dawn: faxes, phones and Bluetooth](https://www.dawn.com/news/2044315/faxes-phones-and-bluetooth-microsoft-outage-forces-businesses-to-find-fixes)
- **GMA**: [GMA News: outage eases after nearly a day](https://www.gmanetwork.com/news/scitech/technology/1009450/microsoft-s-global-outage-eases-after-disrupting-businesses-governments-for-nearly-a-day/story/)
- **O365**: [Office 365 for IT Pros, 16 Nov (16:20–16:10 UTC window)](https://office365itpros.com/2026/11/16/exchange-online-outage-nov26/)
- **IH**: [IncidentHub](https://blog.incidenthub.cloud/microsoft-365-outage-nov-12-2026)
- **AIW**: [AI Weekly citing The Register (July defect, lock contention, testing gap, rollback, 24→48 h)](https://aiweekly.co/alerts/microsoft-blames-november-exchange-online-outage-on-a-software-defect)
- **REG**: [The Register, 23 Nov (headline only; page not reachable from here)](https://www.theregister.com/saas/2026/11/23/microsoft-mega-outage-report-reveals-testing-gaps-and-emails-that-never-arrived/5311656)
- **SO**: [SecurityOnline (80%+ nodes, 3 months without impact)](https://securityonline.info/microsoft-365-global-outage/)
- **NW**: [Neowin: fix not working, servers overwhelmed on return](https://www.neowin.net/news/microsoft-regrets-outlook-exchange-sharepoint-outage-after-admitting-it-still-cant-fix/)
- **ENCA**: [eNCA: steps "not going as expected"](https://enca.com/business-top-stories/global-outage-hits-microsoft-outlook)
- **LAM**: [Charles Lamanna on X (apology, three factors, no failover)](https://x.com/clamanna/status/2122209697226948729)
- **GR**: [Gadget Review on the final report (bounces, ZAP, Safe Links, 6–9 Nov spam filter)](https://www.gadgetreview.com/microsofts-outage-report-bounced-emails-and-silent-security-failures)
- **WF**: [WindowsForum (retry window, final report date)](https://windowsforum.com/news/microsoft-365-november-2026-outage-exchange-failure-cause-and-business-continuity-lessons.453597/)
- **WL**: [Windows Latest (AI tips post)](https://www.windowslatest.com/2026/11/13/were-tired-of-microslop-microsoft-asked-for-ai-tips-on-the-day-a-microsoft-365-outage-hit-millions-and-the-top-reply-said-to-make-sure-that-your-product-doesn/)
- **SMTP**: [serversmtp.com: what our queues saw](https://serversmtp.com/the-microsoft-outage-seen-from-our-queuesour-analysis-of-the-november-12-13-incident/)
- **TE**: [ThousandEyes outage analysis](https://www.thousandeyes.com/blog/microsoft-365-outage-analysis-november-12-2026)
- **MS**: [Microsoft 365 Status (incident EX1550543, Americas first), via Tom's Guide / TechRadar](https://www.tomsguide.com/news/live/microsoft-outlook-down-live-updates-outage-11-12-26)
- **PIR**: [Microsoft preliminary report, as summarised in search results (PDF itself not reachable from here)](https://www.365fanatic.com/wp-content/uploads/2026/11/PostIncidentReport.pdf)
- **OST**: [On-Site Technology (capacity-upgrade framing)](https://www.on-sitetechnology.com/microsoft-365-outage-november-2026/)
- **FAN**: [365fanatic final report write-up (resolved 14 Nov 04:15 UTC)](https://www.365fanatic.com/m365-outage-12-november-2026-final-report/)
