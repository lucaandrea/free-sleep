#!/usr/bin/env python3
"""Build the offline design review and Markdown roadmap from local evidence."""

import base64
import html
import json
from pathlib import Path

REVIEW = Path(__file__).resolve().parent
ROOT = REVIEW.parents[1]
DATA = json.loads((REVIEW / "roadmap.json").read_text())
SOURCES = {source["id"]: source for source in DATA["sources"]}


def escape(value):
    return html.escape(str(value), quote=True)


def picture(relative_path, identifier, description, eager=False):
    content = (ROOT / relative_path).read_bytes()
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif content.startswith(b"\xff\xd8"):
        mime = "image/jpeg"
    else:
        raise ValueError(f"Unsupported screenshot format: {relative_path}")
    encoded = base64.b64encode(content).decode("ascii")
    loading = "eager" if eager else "lazy"
    return f'<img id="{escape(identifier)}" src="data:{mime};base64,{encoded}" alt="{escape(description)}" loading="{loading}" decoding="async">'


def source_link(identifier):
    source = SOURCES[identifier]
    return f'<a href="{escape(source["url"])}" target="_blank" rel="noopener noreferrer">{escape(source["title"])} ↗</a>'


def citations(identifiers):
    return '<div class="citations">' + "".join(source_link(identifier) for identifier in identifiers) + "</div>"


def zoom(identifier, label="Inspect full capture ↗"):
    return f'<button class="zoom js-only" data-zoom="{identifier}">{label}</button>'


SCREENS = [
    {
        "id": "tonight", "title": "Tonight / temperature", "status": "Redesigned + expanded",
        "old": "docs/on.PNG", "new": "docs/review/assets/current-tonight.jpg",
        "old_label": "Temperature dial", "new_label": "Tonight workspace",
        "notes": [
            ("A clearer starting point", "The original screen devotes most of its height to the temperature ring. Tonight introduces a headline, connection state and the selected side before grouping temperature, base position and comfort settings into separate cards."),
            ("Preview, then apply", "The large target value remains easy to find. A linear slider, current-temperature label and explicit Set temperature action distinguish the draft from the running setting. That extra tap is intentional; the old dial is faster for a quick adjustment."),
            ("The whole bed has its own controls", "The new Ultra card adds a bed illustration, Flat/Sleep/Relax/Read presets, separate head and feet angles, reported positions, Move bed and Stop. The illustration previews a request; it is not proof that the hardware moved."),
            ("More capability, more scrolling", "Adaptive comfort and the last-night summary make Tonight useful beyond the thermostat. On a phone this is a longer screen. Alarm and priming banners remain visible when relevant; a more compact nighttime view is a sensible future refinement.")
        ]
    },
    {
        "id": "sleep", "title": "Metrics → Sleep", "status": "Overview + shared episode detail",
        "old": "docs/metrics.PNG", "new": "docs/review/assets/current-sleep.jpg",
        "old_label": "Vitals-first view", "new_label": "Patterns + check-in",
        "notes": [
            ("Lead with understandable patterns", "The old metrics page emphasizes heart rate, HRV, breathing and a dense trace. The new overview leads with bed presence, bedtime variation, heart rate and recorded-night count, followed by a date-based chart."),
            ("Make missing data visible", "The 7/30/90-day selector establishes the comparison window. Recorded nights are counted explicitly. Missing values stay unknown, and Pod presence is described as presence rather than a sleep-duration or sleep-quality claim."),
            ("Give personal context a place", "The morning check-in adds restfulness, temperature comfort and optional habit notes. Numerical habit associations can inform coaching; the notes themselves stay on the Pod under the current sharing contract."),
            ("Inspect the same episode on either platform", "Both apps now browse nights and shorter episodes, presence intervals, heart rate, HRV and breathing, with paginated original readings. The overview capture here predates that addition; see the episode gallery below. Matching journal controls remain open work.")
        ]
    },
    {
        "id": "routines", "title": "Schedules → Routines", "status": "Shared editor completed locally",
        "old": "docs/schedules.PNG", "new": "docs/screenshots/routines-web-phone.jpg",
        "revision": "Routines milestone 6c37306",
        "old_label": "Schedule utility", "new_label": "Routines workspace",
        "notes": [
            ("Read the whole night first", "The shared Monday–Sunday selector sits above one orange temperature timeline. Pod timezone, enabled state, starting time, next-day end time and planned alarm appear together. The chart describes targets; it does not claim the bed instantly reaches them."),
            ("Edit in the same groups", "Web and SwiftUI now share power/temperature, timed adjustments, vibration alarm and copy-days sections. Outlined fields and numeric alarm controls replace the mixture of older controls. System time pickers and confirmation sheets remain native."),
            ("Keep a draft while exploring", "Drafts belong to a Pod, side and day, so switching screens or checking another day does not silently discard edits. Save routine commits the draft; Reload saved restores the stored values. Changed records are checked before a save replaces them."),
            ("Copy with a visible destination", "Weekdays, weekends, every day and individual checkboxes make the affected days explicit. The completed flow has browser and simulator evidence. Cross-day overlap detection and real overnight operation still need qualification; an AI routine composer would be additional work.")
        ]
    },
    {
        "id": "settings", "title": "Settings → Connections + setup", "status": "Reorganized entry point",
        "old": "docs/settings.PNG", "new": "docs/review/assets/current-settings.jpg",
        "old_label": "Device configuration", "new_label": "Connections & appearance",
        "notes": [
            ("Start with how you connect", "The archived settings view begins with timezone, units, reboot, LEDs and Pod information. The new entry screen begins with the Pod/gateway address, connection token and appearance selection."),
            ("Explain each Apple surface", "Apple Home and Health/Shortcuts receive their own contextual cards. Web points to the native iPhone workflow for Health permissions; it does not pretend a browser can directly access HealthKit."),
            ("Keep advanced controls reachable", "Device settings, system health and logs remain linked below the primary setup cards. Operational detail remains available without dominating the first view."),
            ("Guided setup is still needed", "These cards are not evidence of a paired Home bridge, working cloud deployment or granted Health permissions. A shared setup checklist with real connection tests would improve first-run clarity; native permission screens will necessarily remain platform-specific.")
        ]
    }
]


def screen_section(screen):
    identifier = screen["id"]
    pair = []
    for version, title, caption in [("old", "Before", "Repository archive"), ("new", "Redesign", screen.get("revision", "Design milestone e05cd99"))]:
        image_id = f'{identifier}-{version}'
        description = f'{screen["old_label" if version == "old" else "new_label"]} — {caption}'
        pair.append(f'<figure><figcaption class="shot-label">{title}<span>{caption}</span></figcaption><div class="screenshot-scroll" tabindex="0" role="region" aria-label="Scroll {escape(description)}">{picture(screen[version], image_id, description)}</div>{zoom(image_id)}</figure>')
    notes = "".join(f'<article class="annotation"><h4><span class="count">{index:02d}</span>{escape(title)}</h4><p>{escape(body)}</p></article>' for index, (title, body) in enumerate(screen["notes"], 1))
    return f'<section class="screen-review" id="panel-{identifier}" role="tabpanel" aria-labelledby="tab-{identifier}" tabindex="0"><div class="screen-title"><h3>{escape(screen["title"])}</h3><span class="badge">{escape(screen["status"])}</span></div><div class="review-grid"><div class="comparison-pair">{"".join(pair)}</div><div>{notes}</div></div></section>'


def proposal_card(update):
    fields = [("What changes", "delta"), ("How AI fits", "approach"), ("Needs first", "dependencies"), ("Done when", "acceptance")]
    detail = "".join(f'<dt>{label}</dt><dd>{escape(update[key])}</dd>' for label, key in fields)
    return f'''<article class="proposal" data-phase="{update['phase']}" id="update-{update['number']}">
    <div class="proposal-top"><span class="proposal-number">{update['number']:02d} / {escape(update['category'])}</span><span class="proposal-meta">{update['phase']} · {update['effort']}</span></div>
    <h3>{escape(update['title'])}</h3><p class="pitch">{escape(update['pitch'])}</p><p class="example">{escape(update['example'])}</p>
    <details><summary>Read the proposal, dependencies & acceptance</summary><dl>{detail}</dl>{citations(update['sources'])}</details></article>'''


MODEL_ROWS = [
    ("Private default", "Local calculations + deterministic summaries", "Always available. Use Apple’s on-device model on eligible iPhones; a separately hosted local model is an option for the web.", ["apple"]),
    ("First cloud candidate", "GPT-6.1 Sol · gpt-6.1-sol", "Keep the existing initial choice for a bounded coaching pilot. Validate factual grounding, abstention and cost before enabling recurring briefs.", ["openai", "structured"]),
    ("Daily challengers", "Claude Sonnet 5.5 · Gemini 3.8 Flash", "Compare clarity, latency and factual accuracy on the same evidence. Choose using measured app results, not general leaderboard rankings.", ["claude", "gemini"]),
    ("Deeper review candidate", "Gemini 4 Argon · gemini-4-argon", "Evaluate only if simpler candidates miss the quality bar. A long context window alone does not justify sending more personal data.", ["argon"]),
    ("Optional voice", "Gemini 3.8 Live · gemini-3.8-live", "Use for an explicitly chosen spoken check-in. It is a separate audio feature and privacy decision from the text coach.", ["live"]),
    ("Forecast experiment", "Simple thermal baseline → TimesFM 2.5 challenger", "Evaluate on a capable local host in shadow mode. The model predicts; the bounded controller decides whether a reviewed command is allowed.", ["timesfm"])
]


def model_table():
    rows = "".join(f'<tr><td>{escape(role)}</td><td>{escape(model)}</td><td>{escape(reason)}{citations(refs)}</td></tr>' for role, model, reason, refs in MODEL_ROWS)
    return '<div class="table-scroll" tabindex="0" role="region" aria-label="Model recommendation table"><table class="model-table"><thead><tr><th scope="col">Role</th><th scope="col">Candidate</th><th scope="col">Recommendation</th></tr></thead><tbody>' + rows + '</tbody></table></div>'


def followup_gallery(identifier, revision, title, description, captures, evidence):
    """Identify each capture's milestone without implying identical states or live hardware."""
    figures = []
    for path, image_id, caption, detail in captures:
        figures.append(f'<figure><div class="followup-shot">{picture(path, image_id, caption + " — synthetic demo")}</div><figcaption><h4>{caption}</h4><p>{detail}</p></figcaption>{zoom(image_id)}</figure>')
    return f'<div class="completed-followup" id="{identifier}"><div class="followup-heading"><span class="badge green">Completed locally · {revision}</span><h3>{title}</h3><p>{description}</p></div><div class="followup-grid">{"".join(figures)}</div><p class="note">{evidence}</p></div>'


def completed_followups():
    """Show completed app milestones alongside the original design."""
    alarm_captures = [
        ("docs/screenshots/alarm-web-changed.jpg", "alarm-web", "Web · one-time change", "The upcoming alarm shows its date, Pod timezone and Changed once state. Change time, Skip once and Use routine appear together."),
        ("docs/review/assets/native-alarm-changed.png", "alarm-native", "iPhone · matching actions", "SwiftUI exposes the same actions and state. Native text layout and system chrome remain platform-specific."),
        ("docs/review/assets/native-alarm-editor.png", "alarm-editor", "iPhone · native time editor", "A native picker edits one occurrence in the Pod timezone. The weekly routine is preserved.")
    ]
    routine_captures = [
        ("docs/screenshots/routines-web-phone.jpg", "routine-web", "Web · overnight plan", "Read the selected night’s target temperatures, Pod timezone and alarm time before editing. The timeline and section hierarchy are shared with iOS."),
        ("docs/review/assets/native-routines-top.jpg", "routine-native", "iPhone · matching structure", "The same demo Monday uses the same timeline and content groups. The system status bar and native navigation account for some capture differences."),
        ("docs/review/assets/native-routines-saved.jpg", "routine-native-saved", "iPhone · save to selected days", "A weekday save confirms Monday through Friday for the selected side. Per-day drafts, reload and stale-edit checks support the same flow on web.")
    ]
    episode_captures = [
        ("docs/screenshots/episodes-web-phone.jpg", "episode-web", "Web · inspect a recorded night", "The sample has 7h 35m detected presence inside a 7h 50m window, with 88 original readings and 84 eligible heart-rate readings. The distinction stays visible."),
        ("docs/review/assets/native-episodes-detail.jpg", "episode-native", "iPhone · the same source data", "SwiftUI renders the same presence break, 57.3 bpm sample average and chart gaps. The screenshot is scrolled farther down than the web capture."),
        ("docs/screenshots/episodes-web-vitals.jpg", "episode-vitals", "Web · vitals destination restored", "The previously empty vitals page now opens the shared browser, including shorter episodes. Both clients can switch metric and page through original readings.")
    ]
    common_captures = [
        ("docs/screenshots/journal-web-phone.jpg", "journal-web", "Web · morning check-in", "Outlined fields, habit choices, saved dates and explicit save/reset actions now follow the common form language."),
        ("docs/review/assets/native-journal.jpg", "journal-native", "iPhone · matching journal", "The native form shares the same hierarchy. Drafts remain isolated by Pod, side and wake date."),
        ("docs/review/assets/native-coach.jpg", "coach-native", "iPhone · evidence and sharing", "Coach shares the range, provider, question and per-request sharing flow, with a labelled sample result.")
    ]
    device_captures = [
        ("docs/screenshots/preferences-web-saved.jpg", "preferences-web", "Web · saved device preferences", "Timezone, units, side names, Away mode and daily care are grouped together. The capture confirms a simulated Celsius save."),
        ("docs/review/assets/native-preferences-saved.jpg", "preferences-native", "iPhone · the same save flow", "The native app displays the saved setting with the same fields and copy. System menu and navigation chrome remain native."),
        ("docs/review/assets/native-health.jpg", "health-native", "iPhone · service health", "The shared fixture includes a retrying stream. Status, messages and refresh are visible; these reported states are not independent hardware tests.")
    ]
    return "".join([
        followup_gallery("alarm-followup", "f5e2b51", "One alarm change. The same flow on both platforms.", "These captures show the implemented change, skip and restore flow in the web demo and isolated iPhone simulator.", alarm_captures, "Recorded validation: 41 server tests, 18 native tests and five gateway tests passed for this milestone, plus browser/simulator interactions. No live vibration or signed-device Siri run was performed. Changing an alarm does not move the routine’s power-off time."),
        followup_gallery("routines-followup", "6c37306", "A routine you can read, edit and reuse.", "The common editor is now implemented on web and iPhone. These captures replace the earlier claim that Routines was only a visual refresh.", routine_captures, "Recorded validation: 45 server tests, 22 native tests and five gateway tests passed for this milestone. Weekday saves, invalid duplicate adjustments and reload were exercised in the browser and simulator. Actual overnight execution and cross-day overlap detection remain open."),
        followup_gallery("episodes-followup", "b7a56cb", "From a nightly summary to the original readings.", "Recorded nights and shorter episodes now have the same detail layout on both platforms. Gaps remain gaps; missing readings do not turn into zeroes, and excluded values remain inspectable in the original-reading table.", episode_captures, "Recorded validation: 49 server tests, 25 native tests and five gateway tests passed for this milestone. Both clients selected episodes, switched metrics and paged readings. All captures use shared synthetic data; these are presence and experimental vital estimates, not measured sleep stages or clinical results."),
        followup_gallery("common-forms-followup", "4a16125", "One form language, from check-in to coaching.", "Journal and Coach now align across web and native iPhone. Later milestones also align connection setup (8fd99e0), add guarded record editing/deletion (1b4dec7) and verify Shortcuts request behavior (b941925).", common_captures, "Journal/Coach milestone: 51 server and 30 native tests passed with simulated saves and sample coaching. Connection and record-edit captures remain in docs/screenshots. The model response shown is deterministic sample data, not a live provider-quality result."),
        followup_gallery("device-followup", "189d54e", "Everyday settings, in the same place.", "Both clients now expose the same everyday preferences and read-only service health. Preference saves preserve unrelated fields and reject conflicting edits; daily-care scheduling correctly wraps the preceding reboot across midnight.", device_captures, "Latest validation: 96 server, 50 native, six web and six gateway tests passed. Browser and simulator saved Celsius and rendered sample health. Advanced maintenance and logs remain web-only; actual priming/reboot, physical device behavior and signed integrations remain unverified.")
    ])


def roadmap_overview():
    """Offer a compact index without changing proposal IDs used in dependencies."""
    rows = ''.join(f'<tr><td>{item["number"]:02d}</td><td>{escape(item["title"])}</td><td>{escape(item["phase"])}</td><td>{escape(item["effort"])}</td></tr>' for item in DATA['updates'])
    return '<div class="table-scroll roadmap-overview" tabindex="0" role="region" aria-label="All twelve proposed updates at a glance"><table class="roadmap-table"><caption>The twelve proposals at a glance</caption><thead><tr><th scope="col">ID</th><th scope="col">Proposed update</th><th scope="col">Phase</th><th scope="col">Effort</th></tr></thead><tbody>' + rows + '</tbody></table></div>'


def build_html():
    """Render the editorial review with embedded evidence and no runtime assets."""
    css = (REVIEW / "review.css").read_text()
    script = (REVIEW / "review.js").read_text()
    tabs = "".join(f'<button id="tab-{screen["id"]}" role="tab" aria-selected="{str(index == 0).lower()}" aria-controls="panel-{screen["id"]}">{screen["id"].title()}</button>' for index, screen in enumerate(SCREENS))
    native = []
    for name, title, body in [
        ("tonight", "Same visual foundation", "The same cream canvas, typography scale, side selector and temperature hierarchy, rendered in SwiftUI."),
        ("dark", "Warm after dark", "Adaptive charcoal surfaces and softer orange accents carry the same component hierarchy into night mode."),
        ("base", "Preview is not telemetry", "Selected presets and the bed illustration track the draft. Reported angles and Stop remain separate controls."),
        ("large-text", "Room for larger text", "The largest accessibility text setting adapts navigation into a menu. Matching style does not require clipping native text.")
    ]:
        image_id = f"native-{name}"
        native.append(f'<figure class="native-card">{picture(f"docs/review/assets/native-{name}.png", image_id, f"Native iOS simulator — {title}")}<figcaption><h4>{title}</h4><p>{body}</p></figcaption>{zoom(image_id, "Inspect native capture ↗")}</figure>')
    rows = [
        ("Visual tone", "Dark utility interface; blue temperature emphasis.", "Warm cream and white by day; a coordinated warm dark palette. Orange identifies primary actions."),
        ("Navigation", "Five icon destinations in a phone-oriented bottom bar.", "Tonight, Sleep, Coach, Routines and Settings have text labels. A persistent sidebar appears on wider screens."),
        ("Hierarchy", "Large thermostat ring; dense utility screens elsewhere.", "Consistent page titles, small category labels, metric cards and clear action groups."),
        ("Temperature", "Arc, plus/minus and prominent power control.", "Linear draft slider, target/current distinction and an explicit apply action. More deliberate, with an extra tap."),
        ("Base position", "No corresponding control in the archived interface.", "Head/feet preview, presets, requested versus reported state, explicit movement and Stop. Physical qualification remains open."),
        ("Analytics", "Vitals and recorded-data utilities.", "Overview, presence trends and check-ins, plus matching web/iOS episode charts and paginated original readings. Missingness and exclusions are visible."),
        ("AI", "No corresponding coach in the archived interface.", "Optional provider-backed or local coaching over a numerical summary. Current captures use deterministic sample output."),
        ("Schedules", "Day-based step chart and expandable editors.", "A shared overnight timeline, grouped editors, persistent per-day drafts, copy-days choices and explicit save/reload."),
        ("Settings", "Device configuration is the first screen.", "Connections, appearance and integration context come first; device settings and diagnostics remain linked."),
        ("Native iOS", "The original project is a web UI; no native equivalent shown in the archive.", "A separate SwiftUI app shares generated design tokens and contracts. Full screen parity and signed-device proof remain unfinished.")
    ]
    comparison_rows = "".join('<tr>' + ''.join(f'<td>{escape(cell)}</td>' for cell in row) + '</tr>' for row in rows)
    source_items = "".join(f'<li id="source-{source["id"]}">{source_link(source["id"])}<p>{escape(source["note"])}</p></li>' for source in DATA["sources"])
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Free Sleep: a detailed comparison of the archived and current web/iOS designs, with twelve researched proposals for what comes next.">
<meta name="color-scheme" content="light">
<title>Free Sleep — Then, now, next</title>
<style>{css}</style>
</head>
<body>
<a class="skip" href="#main">Skip to the review</a>
<header class="topbar">
<div class="wrap">
<a class="brand" href="#main">
<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
<path d="M22 4C11 5 7 13 10 21c3 7 11 8 17 3-6 1-11-3-11-8 0-4 2-8 6-12Z" stroke="currentColor" stroke-width="1.8"/>
<path d="M5 22l-2 4 5-1M26 7v5m-2.5-2.5h5" stroke="currentColor" stroke-width="1.5"/>
</svg>free sleep</a>
<span class="edition">Design review / 03</span>
<nav aria-label="Review sections">
<a href="#comparison">Before & after</a>
<a href="#design">Design</a>
<a href="#native">iOS</a>
<a href="#roadmap">What’s next</a>
<a href="#research">Research</a>
</nav>
</div>
</header>
<main id="main" class="wrap">
<noscript>
<p class="no-script">All comparison panels and proposal details remain available without JavaScript. Enable JavaScript for tabs, image enlargement and roadmap filters.</p>
</noscript>
<section class="hero">
<p class="revision-note">Design foundation: e05cd99 · Completed work reviewed through 189d54e · Research refreshed 14 October 2026</p>
<span class="eyebrow">Then, now, next · 14 October 2026</span>
<div class="hero-grid">
<div>
<h1>Your bed.<br>A calmer kind<br>of <em>control.</em>
</h1>
<p class="lead">A detailed look at the Free Sleep redesign, the native iPhone experience, and twelve ways to make the app more useful next.</p>
<div class="actions">
<a class="button primary" href="#comparison">Explore the comparison <span aria-hidden="true">↓</span>
</a>
<a class="button" href="#roadmap">See the 12 proposals</a>
</div>
</div>
<figure class="hero-visual">
<div class="hero-pair">
<div class="mini-screen">{picture("docs/on.PNG", "hero-before", "Archived Free Sleep temperature interface", True)}</div>
<div class="mini-screen now">{picture("docs/screenshots/parity-web-phone.png", "hero-now", "Current Free Sleep web demo, warm daylight appearance", True)}</div>
</div>
<figcaption class="hero-caption">Actual repository screenshots, cropped by their frames.<br>Different sample data and states; this is a design comparison.</figcaption>
</figure>
</div>
<div class="stats">
<div class="stat">
<strong>04</strong>
<span>Detailed screen comparisons</span>
</div>
<div class="stat">
<strong>02</strong>
<span>Platforms, shared design tokens</span>
</div>
<div class="stat">
<strong>12</strong>
<span>Prioritized improvement proposals</span>
</div>
<div class="stat">
<strong>{len(DATA["sources"]):02d}</strong>
<span>Primary research references</span>
</div>
</div>
</section>
<section class="section" id="comparison">
<div class="section-head">
<div>
<span class="eyebrow">01 / The interface</span>
<h2>From device utility<br>to daily companion.</h2>
</div>
<p>The earlier UI is direct and functional. The redesign gives the same core controls a warmer home, adds room for base positioning and insight, and makes the main destinations easier to recognize.</p>
</div>
<div class="tabs js-only" role="tablist" aria-label="Choose a screen comparison">{tabs}</div>{''.join(screen_section(screen) for screen in SCREENS)}<p class="note">Scroll inside each capture or open it at full size. The archive includes phone status bars; new web captures are browser content. Long web captures retain the fixed navigation at its original viewport position. Those capture differences are not product defects or a controlled usability test.</p>
</section>
<section class="section" id="design">
<div class="section-head">
<div>
<span class="eyebrow">02 / The design language</span>
<h2>A blend of your<br>three references.</h2>
</div>
<p>The direction combines warm surfaces, restrained orange, quiet borders and compact workspace navigation, informed by <a href="https://github.com/lucaandrea/replit-travel-1">replit-travel-1</a>, <a href="https://github.com/lucaandrea/Grid-by-Replit">Grid-by-Replit</a> and <a href="https://github.com/lucaandrea/grep-v2">grep-v2</a>.</p>
</div>
<div class="desktop-grid">
<figure>
<div class="wide-shot" tabindex="0" role="region" aria-label="Scroll the current desktop interface">{picture("docs/review/assets/current-desktop.jpg", "desktop-now", "Current desktop Tonight page — simulated data and controls")}</div>{zoom("desktop-now")}<figcaption class="caption">Current desktop web demo. Wider space places temperature and base controls side by side; comfort and the last-night summary continue below.</figcaption>
</figure>
<ol class="editorial-list">
<li>
<strong>One recognizable home</strong>The desktop sidebar keeps the same destination names as the phone’s bottom navigation.</li>
<li>
<strong>Color earns its place</strong>Orange is reserved for actions and selected controls. Status colors have their own roles.</li>
<li>
<strong>Information in layers</strong>Headlines and metrics come first; raw records and advanced settings remain reachable.</li>
<li>
<strong>Shared rules, native rendering</strong>Both platforms use system fonts and generated tokens. iOS remains a SwiftUI app.</li>
</ol>
</div>
<div class="token-grid">
<article class="token-box">
<h3>Warm daylight / quiet night</h3>
<div class="swatches">
<span class="swatch" style="--swatch:#faf6f1" title="Day canvas #faf6f1">
</span>
<span class="swatch" style="--swatch:#ffffff" title="Day surface #ffffff">
</span>
<span class="swatch" style="--swatch:#c6411c" title="Day accent #c6411c">
</span>
<span class="swatch" style="--swatch:#191817" title="Night canvas #191817">
</span>
<span class="swatch" style="--swatch:#252321" title="Night surface #252321">
</span>
<span class="swatch" style="--swatch:#ff926e" title="Night accent #ff926e">
</span>
</div>
<p>Day: <code>#faf6f1</code> canvas, white surface, <code>#c6411c</code> accent. Night: <code>#191817</code> canvas, <code>#252321</code> surface, <code>#ff926e</code> accent. Values come from <code>design/tokens.json</code>.</p>
</article>
<article class="token-box">
<h3>Consistency you can maintain</h3>
<div class="token-metrics">
<div>
<strong>44</strong>
<small>Control height</small>
</div>
<div>
<strong>20</strong>
<small>Card radius</small>
</div>
<div>
<strong>1,000</strong>
<small>Page width cap</small>
</div>
</div>
<p>Shared numeric tokens map to CSS pixels on web and points on iOS. The main title scales from 27 to 30; the temperature value uses 76. Native Dynamic Type can grow and reflow text.</p>
</article>
</div>
<div class="table-scroll" tabindex="0" role="region" aria-label="Detailed before and after design comparison">
<table class="comparison-table">
<thead>
<tr>
<th scope="col">Dimension</th>
<th scope="col">Previous experience</th>
<th scope="col">Current experience</th>
</tr>
</thead>
<tbody>{comparison_rows}</tbody>
</table>
</div>
</section>
<section class="section" id="native">
<div class="section-head">
<div>
<span class="eyebrow">03 / Native iPhone</span>
<h2>The same direction.<br>A real native app.</h2>
</div>
<p>These are simulator captures of SwiftUI, cropped from the existing simulator mirror. They show shared styling, simulated controls and text scaling. They do not establish complete visual parity or working signed-device integrations.</p>
</div>
<div class="native-grid">{''.join(native)}</div>{completed_followups()}<div class="gap-box">
<h3>What still separates web and iOS</h3>
<p>The shared design system is in place. The remaining product differences are concrete:</p>
<ul>
<li>Native alarm picker/sheet chrome and notification presentation; the change, skip and restore actions now match.</li>
<li>Native date/time picker and sheet chrome for recorded-episode editing; the guarded edit/delete actions now match.</li>
<li>Native menu controls and accessibility text layout in the aligned journal and Coach forms.</li>
<li>Native Routines time/menu pickers, confirmation sheets and accessibility reflow; the editor and copy-days actions now match.</li>
<li>Advanced maintenance, LED controls, service management and logs remain in the local web app. Connection setup, everyday device preferences and service-health cards now align.</li>
<li>Platform-specific Health and Home permission flows.</li>
</ul>
<p>Routines, episode browsing and editing, journal, Coach, connections and everyday device settings now share their content hierarchy and common actions. OS chrome and accessibility reflow remain native. These are locally validated flows; physical hardware and signed integrations still need qualification.</p>
</div>
</section>
<section class="section" id="added">
<div class="section-head">
<div>
<span class="eyebrow">04 / New capabilities</span>
<h2>More than a<br>change of palette.</h2>
</div>
<p>Some screens have no old counterpart. Their current value is a working local foundation, with clear boundaries around what still needs hardware or account validation.</p>
</div>
<div class="added-grid">
<figure class="coach-shot">
<div class="screenshot-scroll" tabindex="0" role="region" aria-label="Scroll the current Coach demo">{picture("docs/review/assets/current-coach.jpg", "coach-now", "Current Coach screen with a deterministic sample response")}</div>{zoom("coach-now")}<figcaption class="caption">Coach in the current demo. This sample response did not call a cloud model or use personal sleep data.</figcaption>
</figure>
<div class="feature-rows">
<article>
<h3>Coaching with a visible sharing choice</h3>
<p>Local observations are available without a model. Optional provider adapters can explain a numerical summary. HealthKit records are not automatically included, and the model has no device-control tools.</p>
</article>
<article>
<h3>Comfort that learns within limits</h3>
<p>Morning check-ins can inform a bounded temperature offset. Off, Preview and enabled modes keep the behavior understandable; presence, alarms, away mode and manual interaction constrain it. This is feedback-based control, not a reproduced proprietary sleep-stage Autopilot.</p>
</article>
<article>
<h3>Native Health, Home and Shortcuts foundations</h3>
<p>The iPhone app provides personal-side Health workflows and typed native actions. A local Home bridge can expose supported bed controls. Source builds and simulated checks exist; real permissions, pairing, Siri and overnight behavior remain to be qualified.</p>
</article>
</div>
</div>
</section>
<section class="section" id="roadmap">
<div class="section-head">
<div>
<span class="eyebrow">05 / The next twelve</span>
<h2>Useful intelligence.<br>Built on evidence.</h2>
</div>
<p>These are proposals, not features already shipped. Priority reflects user value and dependencies; effort is a relative engineering estimate, not a delivery promise. Each proposal builds on what is already in the repository.</p>
</div>
<div class="roadmap-intro">
<h3>Start with trust, then add convenience.</h3>
<p>My first release would combine data-quality explanations (#9), the AI quality/cost foundation (#3), and an evidence-linked morning brief (#1). Expand the Health timeline (#2) after signed-device checks. Physical automation comes after real Pod and Home qualification.</p>
</div>{roadmap_overview()}<div class="filters js-only" role="group" aria-label="Filter proposals by delivery phase">
<button class="filter" data-filter="All" aria-pressed="true">All 12</button>
<button class="filter" data-filter="First" aria-pressed="false">First · 4</button>
<button class="filter" data-filter="Next" aria-pressed="false">Next · 4</button>
<button class="filter" data-filter="Later" aria-pressed="false">Later · 4</button>
<button class="button expand-all" id="expand-proposals" aria-expanded="false">Expand proposal details +</button>
</div>
<p class="result-count js-only" id="result-count" aria-live="polite">12 of 12 proposals shown. All are proposed work.</p>
<div class="roadmap-grid">{''.join(proposal_card(update) for update in DATA['updates'])}</div>
<div class="phase-plan">
<article>
<span class="eyebrow">First / establish the facts</span>
<h3>#1, #2, #3, #9</h3>
<p>Evidence, personal data provenance, model evaluation and useful explanations. Start #9 and #3 underneath #1; progress #2 once real Health authorization is tested.</p>
</article>
<article>
<span class="eyebrow">Next / reduce the effort</span>
<h3>#4, #5, #7, #8</h3>
<p>Private coaching, guided experiments, voice check-ins and a routine composer. Reuse the completed Routines editor and add a generated-change preview and undo before enabling AI plans.</p>
</article>
<article>
<span class="eyebrow">Later / qualify the environment</span>
<h3>#6, #10, #11, #12</h3>
<p>Thermal forecasting, Home scenes, learned position profiles and optional visual journaling. These need more data, hardware proof or privacy decisions.</p>
</article>
</div>
</section>
<section class="section" id="research">
<div class="section-head">
<div>
<span class="eyebrow">06 / Research snapshot</span>
<h2>The model should<br>fit the job.</h2>
</div>
<p>Research checked against current primary documentation on 14 October 2026. Recommendations below are engineering judgments. No provider has yet been benchmarked on this app’s live data, and no model is established here as clinically validated for sleep.</p>
</div>{model_table()}<div class="research-grid">
<article class="research-note">
<h3>What has advanced</h3>
<p>Apple’s WWDC26 additions include on-device image understanding and local search: useful candidates for the private coach (#4) and optional photo journal (#12). The app still needs runtime availability checks and a fallback for its iOS 18 minimum.</p>{citations(['wwdc'])}<p>Gemini’s current catalog separates reasoning, responsive text and live audio. That makes it possible to evaluate a small daily-summary model separately from an optional voice check-in (#7); it does not establish which model is best for this app.</p>{citations(['gemini','argon','live'])}<p>Apple’s new Evaluations framework adds a way to measure the native coach across datasets, prompts and model changes. This strengthens proposal #3: evaluate grounded answers before enabling recurring summaries.</p>{citations(["evaluations"])}<p>SensorFM’s July 2026 research explores representations for wearable signals. It informs future sensor-analysis research, but does not establish a ready-to-use Pod sleep-staging model.</p>{citations(['sensorfm'])}</article>
<article class="research-note">
<h3>What needs a deliberate choice</h3>
<p>TimesFM 3 adds multivariate forecasting, but its downloaded weights have a non-production restriction. For local production experiments, evaluate the Apache-licensed 2.5 weights or a simpler model; authorized cloud use of 3 has different terms.</p>{citations(['timesfm'])}<p>Apple’s Private Cloud Compute access also has eligibility conditions. Treat it as an optional future path after checking the developer account, platform availability and current terms.</p>{citations(['apple'])}</article>
</div>
<div class="architecture" aria-label="Proposed AI architecture">
<div>
<strong>01 / Observe</strong>
<p>Keep source, side, timestamps and missingness with every record.</p>
</div>
<div>
<strong>02 / Calculate</strong>
<p>Compute metrics, comparisons and bounds in testable application code.</p>
</div>
<div>
<strong>03 / Explain</strong>
<p>Give the chosen model a minimal evidence bundle and validate its response.</p>
</div>
<div>
<strong>04 / Review & act</strong>
<p>Show a plan. Existing authenticated controllers execute only approved, valid actions.</p>
</div>
</div>
<p class="note">Cost illustration: at Sol’s listed standard rate of $2 per million input tokens and $10 per million output tokens, 4,000 input + 800 total billed output tokens costs $0.016, or $0.48 for 30 such calls. This excludes extra reasoning beyond that output allowance, retries, tools, voice, hosting and hardware. It is arithmetic, not a measured bill or a subscription-equivalence claim. {source_link('openai')}</p>
<h3 style="margin-top:35px">Primary sources & why they matter</h3>
<ol class="source-list">{source_items}</ol>
</section>
<section class="section" id="evidence">
<div class="section-head">
<div>
<span class="eyebrow">07 / Evidence & remaining work</span>
<h2>A review you<br>can trace.</h2>
</div>
<p>This document preserves the distinction between code, a rendered demo, a deployed app and a physically verified bed. The screenshot and source inventory is also recorded alongside this file in the repository.</p>
</div>
<div class="method-grid">
<article>
<h3>How the comparison was made</h3>
<p>
<strong>Before:</strong> repository archives <code>docs/on.PNG</code>, <code>metrics.PNG</code>, <code>schedules.PNG</code> and <code>settings.PNG</code>. Their original capture dates and exact build revisions are not recorded.</p>
<p>
<strong>Now:</strong> the original web design captures were taken on 14 October 2026 from <code>e05cd99</code>. The Routines comparison now uses <code>6c37306</code>. The iOS section adds alarm (<code>f5e2b51</code>), Routines (<code>6c37306</code>) and episode (<code>b7a56cb</code>) evidence. Each gallery identifies its milestone. Later galleries cover the aligned everyday forms and device preferences.</p>
<p>All new app images show simulated data. Different values, selected dates and banners are not evidence of a health improvement. Native captures are crops of simulator-mirror images; no UI has been redrawn. Current status was reconciled with <code>docs/DESIGN_PARITY.md</code>, <code>docs/VALIDATION.md</code> and the implemented contracts. The original screenshot files remain in the repository.</p>
</article>
<article>
<h3>What should happen before release</h3>
<p>
<strong>Finish platform qualification:</strong> compare the common screens with equal data, text size and appearance on a signed iPhone and supported iOS versions. Everyday forms and record editing now align; advanced maintenance and log pages remain web-only.</p>
<p>
<strong>Qualify the owner’s setup:</strong> verify stock-Pod access and recovery, base telemetry and Stop, actual temperature control and overnight behavior. No installation or bed movement was performed for this document.</p>
<p>
<strong>Prove the integrations:</strong> signed iPhone Health/Shortcuts tests, actual Home pairing, and an authenticated Replit deployment with reconnect and offline checks. None follows from a simulator screenshot.</p>
<p>
<strong>Evaluate AI:</strong> run the grounded test set with the selected account/model, then enable a bounded pilot. This research did not send personal records to providers.</p>
</article>
</div>
<div class="status-line">
<span class="badge green">Source + demo evidence available</span>
<span class="badge">Hardware validation pending</span>
<span class="badge">Signed integrations pending</span>
<span class="badge">Deployment pending</span>
</div>
</section>
</main>
<footer class="wrap footer">
<div>
<strong>free sleep / then, now, next</strong>
<p>Self-contained HTML · embedded screenshots · no external fonts, scripts or trackers.</p>
</div>
<button class="button js-only" id="print-review">Print / save as PDF ↗</button>
</footer>
<dialog id="image-dialog" aria-labelledby="dialog-title">
<div class="dialog-bar">
<p id="dialog-title">Screenshot</p>
<button id="close-dialog" autofocus>Close ×</button>
</div>
<div class="dialog-content">
<img id="dialog-image" alt="">
</div>
</dialog>
<script>{script}</script>
</body>
</html>'''


def build_markdown():
    """Reuse the proposal data so the text roadmap stays aligned with the review."""
    lines = [
        "# Free Sleep — twelve next improvements", "", "Research snapshot: 14 October 2026. Design foundation: `e05cd99`; completed implementation reviewed through `189d54e`.", "",
        "These are proposals, not shipped features. Effort is relative engineering scope, not a deadline. Start with data-quality explanations (#9), model evaluation and budgeting (#3), then the evidence-linked morning brief (#1). Expand Health context (#2) after signed-device validation.", "",
        "## Current foundation", "",
        "The repository already contains the shared web/SwiftUI design system, base preview/control adapter, presence analytics, journal, optional AI adapters, bounded feedback-based comfort, one-time alarm change/skip/restore, matching Routines editors, episode/vitals browsing, native Health workflows, Home bridge and App Intents. These have local/source/simulator evidence. Physical Pod/base operation, signed integrations, provider quality and Replit deployment remain unverified. Common journal, Coach, connection, device-preference and health layouts now align, and native record editing/deletion is implemented. Advanced maintenance and logs remain web-only.", "",
        "## Model recommendation", "", "| Role | Candidate | Why |", "| --- | --- | --- |"
    ]
    for role, model, reason, refs in MODEL_ROWS:
        links = " · ".join(f'[{SOURCES[identifier]["title"]}]({SOURCES[identifier]["url"]})' for identifier in refs)
        lines.append(f"| {role} | {model} | {reason} {links} |")
    lines.extend(["", "## The twelve proposals at a glance", "", "| ID | Proposed update | Phase | Effort |", "| --- | --- | --- | --- |"])
    for update in DATA["updates"]:
        lines.append(f'| {update["number"]} | {update["title"]} | {update["phase"]} | {update["effort"]} |')
    lines.extend(["", "These are app-specific engineering recommendations, not clinical validation or measured provider rankings. Use the smallest candidate that passes an evidence-grounded evaluation. Keep the provider choice explicit and measure full token cost, including reasoning.", "", "## Proposals", ""])
    for update in DATA["updates"]:
        lines.extend([f'### {update["number"]}. {update["title"]}', "", f'**Phase:** {update["phase"]} · **Effort:** {update["effort"]} · **Area:** {update["category"]}', "", update["pitch"], "", f'> {update["example"]}', ""])
        for label, key in [("New work", "delta"), ("AI approach", "approach"), ("Dependencies", "dependencies"), ("Acceptance", "acceptance")]:
            lines.extend([f'**{label}:** {update[key]}', ""])
        lines.extend(["Research: " + ", ".join(f'[{SOURCES[identifier]["title"]}]({SOURCES[identifier]["url"]})' for identifier in update["sources"]), ""])
    lines.extend(["## What is new in the research", "", "Apple’s WWDC26 Foundation Models additions include on-device image understanding and local search, which could support the private coach and photo journal. Its Evaluations framework integrates with Swift Testing to measure regressions. [Foundation Models additions](https://developer.apple.com/videos/play/wwdc2026/241/), [Evaluations](https://developer.apple.com/videos/play/wwdc2026/298/). Gemini’s current catalog separates reasoning, responsive text and live voice models. OpenAI Sol and Anthropic Sonnet are additional candidates for the bounded cloud coach; no live comparison has been performed here. [Gemini catalog](https://ai.google.dev/gemini-api/docs/models), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Claude catalog](https://platform.claude.com/docs/en/models/overview).", "", "SensorFM is a wearable-representation research direction, not a drop-in validated sleep-staging feature. [Google Research](https://research.google/blog/sensorfm-towards-a-general-intelligence-and-interface-for-wearable-health-data/). TimesFM 3 is newer, but its downloaded weights are restricted to non-commercial, non-production use; weights through 2.5 remain Apache-2.0. Evaluate the latter or a simple thermal baseline for a local production path. Authorized cloud use of 3 has different terms. [TimesFM license notice](https://github.com/google-research/timesfm). Apple Private Cloud Compute access also has eligibility conditions to check before relying on it. [Apple framework overview](https://developer.apple.com/foundation-models-framework/).", "", "Cost illustration: Sol’s listed standard $2 input / $10 output per million tokens makes 4,000 input + 800 total billed output tokens $0.016 per call, or $0.48 for 30. Extra reasoning beyond this allowance, retries, tools, voice, hosting and hardware are excluded. This is illustrative arithmetic, not a measured bill or equivalence to Eight Sleep’s subscription. [Listed Sol rates](https://developers.openai.com/api/docs/models/gpt-6.1-sol).", "", "## Release prerequisites", "", "- Qualify common screen behavior on signed iPhones and supported iOS versions. Journal, Coach, settings and guarded record editing now align locally; advanced maintenance and logs remain web-only.", "- Verify stock-Pod access/recovery, base telemetry/calibration/Stop, temperature control and overnight behavior.", "- Test a signed iPhone’s Health authorization/sync and Shortcuts; pair the real Home bridge.", "- Deploy and verify the authenticated Replit gateway, reconnect and offline behavior.", "- Establish evaluation fixtures and account/model access before recurring cloud features.", "", "## Primary sources", ""])
    for source in DATA["sources"]:
        lines.extend([f'- [{source["title"]}]({source["url"]}) — {source["note"]}'])
    lines.extend(["", "The standalone visual review is [free-sleep-before-after.html](free-sleep-before-after.html). Regenerate both documents with `python3 docs/review/build_review.py` from the repository root.", ""])
    return "\n".join(lines)


if __name__ == "__main__":
    (REVIEW / "free-sleep-before-after.html").write_text(build_html())
    (REVIEW / "ROADMAP.md").write_text(build_markdown())
    print("Built standalone HTML review and Markdown roadmap.")
