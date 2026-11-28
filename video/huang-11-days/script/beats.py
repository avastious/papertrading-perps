#!/usr/bin/env python3
"""Beat sheet for "11 Days: The CEO Who Came Back" (10-15 minutes).
One row per narration line. Writes beat_sheet.md and beat_sheet.csv next to this file and
checks the rules: 8-25 words a line, every beat after the first linked by BUT or THEREFORE,
and the narration never says "but", "therefore" or "and then".
usage: python3 beats.py"""
import csv, os, re, sys

# Flags: FACT = backed by a named source; REPORTED = one secondhand source, or sources disagree;
# STORY = invented scene or character (a stand-in for real people); ANALYSIS = our reading of the facts;
# GENERAL = common knowledge, not checked against a source for this video; LEGEND = folklore, not fact.
SETS = {
    'BOARD': 'Boardroom: long table, tall windows, a portrait-free wall, the CEO chair at the head',
    'TRADE': 'Trading floor (Bigsby the investor, tickers, screens)',
    'NEWS': 'Newsroom (Rita the reporter, screens, a breaking-news sign)',
    'CITY': 'Washington street: a domed building, courthouse, government offices (all generic)',
    'CARD': 'Cards: title, quote, chart and timeline cards (no real people drawn)',
}
# Real people are never drawn. The CEO is shown as an empty chair with a black jacket; directors, staff, investors and
# officials are generic stand-ins. Allegations are attributed to who reported them.
B = [
 # ---- COLD OPEN ----
 ('', "Sunday the twenty-third of November, 2026. In a quiet boardroom, a chair that sat empty for eleven days is pushed back to the table.",
  "The empty CEO chair, black jacket on its back, rolls up to the head of the table.", 'BOARD', 'Sun 23 Nov 2026', 'FACT', '8K2'),
 ('THEREFORE', "Nvidia's board has just voted, unanimously, to reinstate Jensen Huang as president, chief executive and director, effective immediately.",
  "Directors raise their hands one by one. A gavel lands.", 'BOARD', 'Vote: unanimous', 'FACT', '8K2'),
 ('BUT', "Six days earlier, the same board had said it did not intend to bring him back at all.",
  "A flashback card: 17 Nov, a speech bubble crossed out.", 'CARD', '17 Nov: "does not intend to reinstate"', 'REPORTED', 'NPR YAH'),
 ('THEREFORE', "Shares of the world's most valuable chip company jumped on the news, by more than thirty percent according to CNN.",
  "Bigsby's screen: a green line rockets upward.", 'TRADE', '+30%? (CNN)', 'REPORTED (one outlet; check the final figure)', 'CNN2'),
 ('BUT', "The investigation that started it all had not finished. The board said it would carry on to its conclusion.",
  "A thick folder marked INVESTIGATION, still open, sits beside the chair.", 'BOARD', 'Investigation: ongoing', 'FACT', '8K2'),
 ('THEREFORE', "So how does a company lose its founder, refuse to take him back, and reverse itself in eleven days?",
  "Title card over the empty chair.", 'CARD', '11 DAYS', 'ANALYSIS', ''),

 # ---- ACT 1: the founder ----
 ('THEREFORE', "To understand the shock, start with what Huang meant to Nvidia: he co-founded it in 1993 and ran it ever since.",
  "Chip the GPU mascot unrolls a long scroll of years.", 'CARD', '1993', 'GENERAL (well documented)', 'WIKI'),
 ('BUT', "Nvidia had become far more than a graphics company. Its chips power much of the world's artificial intelligence.",
  "Chip stands proudly in front of a wall of servers.", 'CARD', '', 'GENERAL', ''),
 ('THEREFORE', "Investors treated the founder and the company as almost the same thing. His black leather jacket became a symbol.",
  "The jacket on its hanger glows under a spotlight.", 'BOARD', '', 'ANALYSIS', ''),
 ('BUT', "A company that leans that hard on one person is exposed when that person is suddenly in trouble.",
  "The chair wobbles on one leg.", 'BOARD', '', 'ANALYSIS', ''),

 # ---- ACT 2: the inquiry ----
 ('THEREFORE', "On the eighth of November, according to CNN, the board opened an independent investigation involving its chief executive.",
  "Directors close the boardroom door. A sign flips to PRIVATE.", 'BOARD', '8 Nov', 'REPORTED', 'CNN2'),
 ('THEREFORE', "Word got out. Nvidia shares fell about five percent as the inquiry became public, according to market reports.",
  "Bigsby's screen: a red line dips.", 'TRADE', '−5%', 'REPORTED', 'TP CB'),
 ('BUT', "Nobody outside the room yet knew what the investigation was about.",
  "Rita the reporter presses her ear to the boardroom door.", 'NEWS', '', 'ANALYSIS', ''),
 ('THEREFORE', "Then the New York Times published its story, and the details landed all at once.",
  "Newspaper slaps onto Rita's desk (generic masthead).", 'NEWS', '', 'REPORTED', 'WP VAR'),
 ('THEREFORE', "The reports described extramarital affairs. Outlets differed on how many: Variety said several, the Washington Post cited two.",
  "Two newspapers side by side, headlines blurred.", 'NEWS', 'Sources disagree', 'REPORTED (outlets differ)', 'VAR WP'),
 ('BUT', "One allegation was far more serious than a personal scandal. It touched national security.",
  "A red DOSSIER envelope slides across the desk.", 'NEWS', '', 'REPORTED', 'WP'),
 ('THEREFORE', "The Times reported that one woman, a Chinese tech executive, had been recruited by China's Ministry of State Security.",
  "A shadowy silhouette card, no face, labelled ALLEGED.", 'CARD', 'ALLEGED', 'ALLEGED (reported by the New York Times)', 'WP VAR'),
 ('THEREFORE', "The reported aim was to learn more about Nvidia's AI chips, the most valuable technology the company has.",
  "Chip the mascot hugs itself nervously.", 'CARD', 'ALLEGED', 'ALLEGED (reported)', 'WP'),
 ('BUT', "These were allegations in press reports. The board said it had no reason to believe national security was compromised.",
  "A board statement card, plain type.", 'CARD', '"no reason to believe national security was compromised"', 'REPORTED (board statement as reported)', 'WP'),
 ('THEREFORE', "Even the president was unsure. Donald Trump said it was unclear whether the woman was a spy at all.",
  "A generic podium with a microphone (no person) and a question mark.", 'CITY', '', 'REPORTED', 'WP'),

 # ---- ACT 3: the fall ----
 ('BUT', "Uncertainty is poison to a board. Directors had to decide quickly what Nvidia's leader could still do.",
  "Directors around the table, the clock ticking loudly.", 'BOARD', '', 'ANALYSIS', ''),
 ('THEREFORE', "On the eleventh, the board accepted Huang's resignation as president, chief executive and director, effective immediately.",
  "The jacket is lifted off the chair. The chair is pushed back.", 'BOARD', '11 Nov', 'FACT', '8K1'),
 ('THEREFORE', "Nvidia announced it publicly on the twelfth, thanking him for what it called immeasurable contributions to the company.",
  "A press-release card slides in.", 'CARD', '"immeasurable contributions"', 'FACT', 'PR1'),
 ('BUT', "Somebody still had to run the company the next morning.",
  "The empty chair, a spotlight on it, an alarm clock ringing.", 'BOARD', '', 'ANALYSIS', ''),
 ('THEREFORE', "The board named chief financial officer Colette Kress interim chief executive while it searched for a permanent replacement.",
  "A nameplate card: INTERIM CEO. No portrait.", 'CARD', 'Interim CEO: Colette Kress', 'FACT', 'PR1 AJ'),
 ('THEREFORE', "It also created a new role. Harvey Jones became the first-ever chair of Nvidia's board.",
  "A nameplate card: CHAIR OF THE BOARD. No portrait.", 'CARD', 'First board chair', 'REPORTED', 'AJ'),
 ('BUT', "Markets do not wait for searches. Nvidia's stock fell about four percent that Thursday, the Washington Post reported.",
  "Bigsby watches a red candle drop.", 'TRADE', '−4%', 'REPORTED', 'WP'),
 ('THEREFORE', "CNN put the loss in market value as high as one point seven six trillion dollars, likely over a longer stretch.",
  "A huge stack of coins topples.", 'TRADE', '$1.76T (CNN, period unclear)', 'REPORTED (figure may span several days)', 'CNN1'),
 ('BUT', "Washington was not finished either. Congress summoned Huang to testify, according to CNN.",
  "A domed building with a summons envelope flying from it.", 'CITY', 'Summoned to testify', 'REPORTED', 'CNN1'),

 # ---- ACT 4: the refusal ----
 ('THEREFORE', "Inside the company, staff wondered whether the founder could ever return.",
  "Dev the engineer stares at the empty chair through a glass door.", 'BOARD', '', 'ANALYSIS', ''),
 ('BUT', "On the seventeenth, the answer seemed final. The board said it did not intend to reinstate him.",
  "A board statement card stamped FINAL.", 'CARD', '"does not intend to reinstate"', 'REPORTED', 'NPR YAH'),
 ('THEREFORE', "The chairman repeated it on an earnings call, the Yahoo News timeline reported.",
  "A speakerphone on the table; a speech bubble.", 'BOARD', '', 'REPORTED', 'YAH'),
 ('BUT', "One Nvidia employee did not accept that. They built a website with an open letter.",
  "Dev types fast; a web page appears: STAND WITH JENSEN.", 'NEWS', '"Stand With Jensen"', 'REPORTED', 'FOR WIKI'),
 ('THEREFORE', "The letter asked the board to bring him back while an independent investigation ran its course.",
  "The letter scrolls on Dev's screen.", 'NEWS', '', 'REPORTED', 'WIKI'),
 ('THEREFORE', "Signatures poured in: more than one hundred seventy-eight thousand in four days, according to Wikipedia's summary.",
  "A counter spins upward.", 'CARD', '178,000+ in 4 days', 'REPORTED (counts vary)', 'WIKI'),
 ('BUT', "Counts kept changing. Fortune later put it above two hundred six thousand names.",
  "The counter ticks past 206,000.", 'CARD', '206,000+', 'REPORTED (counts vary)', 'FOR'),
 ('THEREFORE', "Tom's Guide reported over seventy-five hundred self-identified Nvidia employees among them, and Elon Musk too.",
  "A wall of tiny name tags; one shaped like a rocket.", 'CARD', '7,500+ staff (self-identified)', 'REPORTED', 'TG'),
 ('BUT', "Online petitions cannot verify who signs them, so these numbers are a mood, not a vote.",
  "A ballot box with a question mark.", 'CARD', 'Unverified signatures', 'ANALYSIS', ''),

 # ---- ACT 5: the pressure ----
 ('THEREFORE', "Money spoke too. Two well-known tech investors wrote to the board, Reuters reported.",
  "Bigsby writes a letter with a fountain pen.", 'TRADE', '', 'REPORTED', 'SH'),
 ('THEREFORE', "Brad Gerstner and Gavin Baker urged a deliberate process instead of a rushed replacement, keeping a return possible.",
  "The letter folds into a paper plane and flies to the boardroom.", 'TRADE', '"a deliberate process"', 'REPORTED', 'SH'),
 ('BUT', "The loudest push came from Washington, on a weekend.",
  "The red phone in the boardroom starts ringing.", 'BOARD', '', 'REPORTED', 'FOR BG'),
 ('THEREFORE', "On Sunday, Trump posted on Truth Social calling for Huang to be rehired.",
  "A phone screen card with a generic post bubble.", 'CARD', 'Truth Social post', 'REPORTED', 'FOR'),
 ('THEREFORE', "On Monday he told CNBC he had been talking with the board and with Huang, and called the board reasonable.",
  "A TV screen card with a quote bubble (no person drawn).", 'CARD', '"reasonable"', 'REPORTED', 'FOR'),
 ('THEREFORE', "The Verge reported he personally lobbied directors over that weekend.",
  "The red phone rings at each director's seat in turn.", 'BOARD', '', 'REPORTED (via a summary of The Verge)', 'BG'),
 ('BUT', "A president pressing a private company's board is highly unusual, and critics said so.",
  "Rita reads a stack of opinion pages, eyebrows raised.", 'NEWS', '', 'ANALYSIS', ''),

 # ---- ACT 6: the return ----
 ('THEREFORE', "On the twenty-third, the board met again, and this time the vote went the other way, unanimously.",
  "The hands go up again. The jacket goes back on the chair.", 'BOARD', '23 Nov', 'FACT', '8K2'),
 ('THEREFORE', "Its filing said the board was satisfied with Huang's candor and ability to lead Nvidia.",
  "Quote card from the filing.", 'CARD', '"candor and ability to lead NVIDIA"', 'FACT', '8K2'),
 ('BUT', "The same filing added a striking line: the board had received input from senior levels of the United States government.",
  "The red phone sits on the table, receiver off the hook.", 'CARD', '"input from senior levels of the United States government"', 'FACT', '8K2'),
 ('THEREFORE', "Investors cheered. CNN reported the shares soared more than thirty percent, one of the stock's best days on record.",
  "Bigsby throws ticker tape in the air.", 'TRADE', '+30% (CNN)', 'REPORTED (one outlet)', 'CNN2'),
 ('BUT', "The cheer did not last. In later sessions the stock fell again, by between four and seven percent.",
  "The ticker tape stops; Bigsby looks at a dipping line.", 'TRADE', '−4.3% to −7.5%', 'REPORTED', 'CNN2'),
 ('THEREFORE', "One estimate put that pullback at three to four hundred and fifty billion dollars in market value.",
  "A melting stack of coins.", 'TRADE', '$300–450B', 'REPORTED (one estimate)', 'CNN2'),

 # ---- ACT 7: the questions ----
 ('BUT', "Returning to the job is not the same as being cleared. CBC stressed that Huang had not been exonerated.",
  "The chair has a sticky note: NOT CLEARED.", 'BOARD', 'Not exonerated', 'REPORTED', 'CBC'),
 ('THEREFORE', "The board's own investigation, opened on the eighth, had no announced end date.",
  "The INVESTIGATION folder grows thicker; a calendar with no end.", 'BOARD', 'No end date', 'REPORTED', 'CNN2'),
 ('THEREFORE', "Reports listed the SEC, the FBI and California's attorney general among those involved in inquiries.",
  "Three generic official seals (no real logos) on a card.", 'CARD', 'SEC · FBI · California AG', 'REPORTED (one source)', 'CNN2'),
 ('BUT', "Asked on Fox News whether Huang had been cleared, Attorney General Todd Blanche would not even acknowledge an investigation.",
  "A podium card with a closed door.", 'CARD', '', 'REPORTED', 'CNN2'),
 ('THEREFORE', "Critics in Congress were furious. Hakeem Jeffries called the reinstatement indefensible, irresponsible and incomprehensible.",
  "A quote card in red.", 'CARD', '"indefensible, irresponsible and incomprehensible"', 'REPORTED', 'CNN2'),
 ('BUT', "Supporters saw it differently: a founder back at work, and a company steadied.",
  "Dev and staff cheer quietly at their desks.", 'NEWS', '', 'ANALYSIS', ''),
 ('THEREFORE', "The episode left an uneasy question about who really decides who runs a company: its board, its staff, or the government.",
  "Three arrows point at the chair: BOARD, STAFF, WASHINGTON.", 'BOARD', '', 'ANALYSIS', ''),
 ('THEREFORE', "Some analysts warned the precedent may outlast this one chief executive.",
  "A long shadow stretches from the chair across the floor.", 'BOARD', '', 'REPORTED', 'BG'),
 ('BUT', "Governance experts also note that a single irreplaceable leader is itself a risk the board must plan for.",
  "Chip draws a succession chart with only one box.", 'CARD', '', 'ANALYSIS', ''),

 # ---- ACT 8: what we know ----
 ('THEREFORE', "So, what is confirmed? Nvidia's filings confirm the resignation, the interim leadership, and the unanimous reinstatement.",
  "A checklist with three green ticks.", 'CARD', 'Confirmed by filings', 'FACT', '8K1 8K2 PR1'),
 ('BUT', "The spying claim remains an allegation from press reports, and investigations are still running.",
  "A checklist line with a yellow question mark.", 'CARD', 'Alleged · ongoing', 'ANALYSIS', 'WP 8K2'),
 ('THEREFORE', "We found no public statement from Huang addressing the allegations in the sources we checked for this video.",
  "A blank speech bubble over the empty chair.", 'CARD', '', 'REPORTED (absence in our sources)', ''),
 ('BUT', "Eleven days were enough to show how fast a single story can move a trillion-dollar company.",
  "A calendar flips through eleven pages in a blur.", 'CARD', '11 days', 'ANALYSIS', ''),
 ('THEREFORE', "Back in the boardroom, the folder stays open on the table, right next to the chair.",
  "Final shot: the jacket on the chair, the open folder beside it, lights dimming.", 'BOARD', '11 DAYS · Nov 2026', 'STORY', ''),
]
SOURCES = {
    '8K1': ('Nvidia 8-K, 11 Nov (resignation)', 'https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000082/nvda-20261111.htm'),
    'PR1': ('Nvidia: CEO transition', 'https://nvidianews.nvidia.com/news/nvidia-announces-ceo-transition'),
    '8K2': ('Nvidia 8-K, 23 Nov (reinstatement)', 'https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000090/nov23pressrelease.htm'),
    'AJ': ('Al Jazeera: who is Colette Kress', 'https://www.aljazeera.com/news/2026/11/12/why-did-nvidia-ceo-jensen-huang-resign-and-who-is-colette-kress'),
    'WP': ('Washington Post, 12 Nov', 'https://www.washingtonpost.com/technology/2026/11/12/nvidia-board-weighs-jensen-huangs-future-after-affair-with-allege-chinese-spy/'),
    'VAR': ('Variety', 'https://variety.com/2026/biz/news/nvidia-ceo-jensen-huang-resigns-affairs-alleged-chinese-spy-1236945653/'),
    'CNN1': ('CNN live: summoned to testify', 'https://www.cnn.com/2026/11/11/business/live-news/nvidia-jensen-huang-investigation-fallout'),
    'NPR': ('NPR, 17 Nov', 'https://www.npr.org/2026/11/17/nx-s1-6044213/jensen-huang-nvidia-congress'),
    'YAH': ('Yahoo News timeline', 'https://www.yahoo.com/news/politics/article/from-spy-allegations-to-a-ceo-comeback-a-timeline-of-jensen-huangs-nvidia-scandal-212728393.html'),
    'WIKI': ('Wikipedia: Jensen Huang spying scandal', 'https://en.wikipedia.org/wiki/Jensen_Huang_spying_scandal'),
    'FOR': ('Fortune: the 11 days', 'https://fortune.com/2026/11/23/the-11-days-that-brought-jensen-huang-back-to-nvidia/'),
    'TG': ("Tom's Guide", 'https://www.tomsguide.com/computing/jensen-huang-is-back-as-nvidia-ceo-after-just-11-days-what-it-means-for-you'),
    'SH': ('Shattered (citing Reuters): investor letter', 'https://shattered.io/nvidia-reinstates-jensen-huang-ceo-11-days-after-resignation-trump-investors/'),
    'BG': ('BigGo Finance (summarising The Verge)', 'https://finance.biggo.com/news/5c0a79308df7a5a4'),
    'CNN2': ('CNN live, 23 Nov: shares soar', 'https://www.cnn.com/2026/11/23/business/live-news/jensen-huang-reinstated-as-ceo-of-nvidia'),
    'TP': ('TokenPost: shares fall 5% on inquiry', 'https://www.tokenpost.com/news/business/63052'),
    'CB': ('Crypto Briefing: shares fall on inquiry', 'https://cryptobriefing.com/nvidia-shares-fall-board-inquiry-jensen-huang/'),
    'CBC': ('CBC live', 'https://www.cbc.ca/news/business/livestory/nvidia-jensen-huang-reinstated-spy-scandal-9.7432391'),
}
WPM = 150
words = lambda s: len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’.,:\-]*", s))


def check():
    bad = []
    for i, (link, line, *_rest) in enumerate(B, 1):
        n = words(line)
        if not 8 <= n <= 25: bad.append(f'{i}: {n} words')
        if i > 1 and link not in ('BUT', 'THEREFORE'): bad.append(f'{i}: no BUT/THEREFORE link')
        if re.search(r"\b(but|therefore)\b|\band then\b", line, re.I): bad.append(f'{i}: says a banned word')
        for k in _rest[-1].split():
            if k not in SOURCES: bad.append(f'{i}: unknown source {k}')
    return bad


def main():
    bad = check()
    if bad: print('\n'.join(bad)); sys.exit(1)
    here = os.path.dirname(os.path.abspath(__file__))
    total = sum(words(b[1]) for b in B)
    secs = total / WPM * 60 + len(B) * 1.2       # narration plus a short breath per beat
    acts = {0: 'Cold open', 6: 'Act 1 · The founder', 10: 'Act 2 · The inquiry', 20: 'Act 3 · The fall', 28: 'Act 4 · The refusal',
            37: 'Act 5 · The pressure', 44: 'Act 6 · The return', 50: 'Act 7 · The questions', 59: 'Act 8 · What we know'}
    md = ['# 11 Days: beat sheet (version 1)', '',
          f'{len(B)} beats · {total} words · about {secs / 60:.0f} minutes at {WPM} words a minute with a breath per beat.', '',
          '**Link** says how each beat follows the one before: **BUT** (a complication) or **THEREFORE** (a consequence). '
          'The narration itself never says "but", "therefore" or "and then".', '',
          '**Flag:** FACT = named source · REPORTED = secondhand or sources disagree · STORY = invented scene or character · '
          'ANALYSIS = our reading · GENERAL = common knowledge, not checked for this video · **LEGEND = folklore, not fact**.', '',
          '## Sets', ''] + [f'- **{k}**: {v}' for k, v in SETS.items()]
    for i, (link, line, pic, st, txt, flag, src) in enumerate(B):
        if i in acts:
            md += ['', f'## {acts[i]}', '', '| # | Link | Narration | Words | Picture | Set | On-screen text | Flag | Sources |',
                   '|---|---|---|---|---|---|---|---|---|']
        cell = lambda s: s.replace('|', '\\|')
        md.append(f'| {i + 1} | {link or "OPEN"} | {cell(line)} | {words(line)} | {cell(pic)} | {st} | {cell(txt)} | {flag} | {src} |')
    md += ['', '## Sources', ''] + [f'- **{k}**: [{t}]({u})' for k, (t, u) in SOURCES.items()]
    open(os.path.join(here, 'beat_sheet.md'), 'w').write('\n'.join(md) + '\n')
    with open(os.path.join(here, 'beat_sheet.csv'), 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['beat', 'link', 'narration', 'words', 'picture', 'set', 'on_screen_text', 'flag', 'sources'])
        for i, (link, line, pic, st, txt, flag, src) in enumerate(B, 1):
            w.writerow([i, link or 'OPEN', line, words(line), pic, st, txt, flag, src])
    print(f'{len(B)} beats, {total} words, ~{secs / 60:.1f} min')


if __name__ == '__main__':
    main()
