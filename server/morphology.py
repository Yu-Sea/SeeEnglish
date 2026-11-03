"""Small, dependency-free English morphology helpers.

This is intentionally not a full lemmatizer. It handles the forms a personal
vocabulary app meets most often: plurals, third-person singular, past tense,
present participles, comparatives and a curated set of irregular words.
"""

from __future__ import annotations

import re

WORD_RE = re.compile(r"^[a-z][a-z' -]*$")

# base -> inflected form -> short Chinese label
IRREGULAR_FORMS: dict[str, dict[str, str]] = {
    "be": {
        "am": "第一人称单数",
        "is": "第三人称单数",
        "are": "复数",
        "was": "过去式",
        "were": "过去式",
        "been": "过去分词",
        "being": "现在分词",
    },
    "have": {"has": "第三人称单数", "had": "过去式 / 过去分词", "having": "现在分词"},
    "do": {"does": "第三人称单数", "did": "过去式", "done": "过去分词", "doing": "现在分词"},
    "go": {"goes": "第三人称单数", "went": "过去式", "gone": "过去分词", "going": "现在分词"},
    "say": {"said": "过去式 / 过去分词"},
    "get": {"got": "过去式 / 过去分词", "gotten": "过去分词"},
    "make": {"made": "过去式 / 过去分词"},
    "know": {"knew": "过去式", "known": "过去分词"},
    "think": {"thought": "过去式 / 过去分词"},
    "take": {"took": "过去式", "taken": "过去分词"},
    "see": {"saw": "过去式", "seen": "过去分词"},
    "come": {"came": "过去式"},
    "find": {"found": "过去式 / 过去分词"},
    "give": {"gave": "过去式", "given": "过去分词"},
    "tell": {"told": "过去式 / 过去分词"},
    "feel": {"felt": "过去式 / 过去分词"},
    "become": {"became": "过去式"},
    "leave": {"left": "过去式 / 过去分词"},
    "mean": {"meant": "过去式 / 过去分词"},
    "keep": {"kept": "过去式 / 过去分词"},
    "begin": {"began": "过去式", "begun": "过去分词"},
    "hear": {"heard": "过去式 / 过去分词"},
    "run": {"ran": "过去式"},
    "hold": {"held": "过去式 / 过去分词"},
    "bring": {"brought": "过去式 / 过去分词"},
    "write": {"wrote": "过去式", "written": "过去分词"},
    "sit": {"sat": "过去式 / 过去分词"},
    "stand": {"stood": "过去式 / 过去分词"},
    "lose": {"lost": "过去式 / 过去分词"},
    "pay": {"paid": "过去式 / 过去分词"},
    "meet": {"met": "过去式 / 过去分词"},
    "lead": {"led": "过去式 / 过去分词"},
    "understand": {"understood": "过去式 / 过去分词"},
    "speak": {"spoke": "过去式", "spoken": "过去分词"},
    "spend": {"spent": "过去式 / 过去分词"},
    "grow": {"grew": "过去式", "grown": "过去分词"},
    "win": {"won": "过去式 / 过去分词"},
    "buy": {"bought": "过去式 / 过去分词"},
    "send": {"sent": "过去式 / 过去分词"},
    "build": {"built": "过去式 / 过去分词"},
    "fall": {"fell": "过去式", "fallen": "过去分词"},
    "drive": {"drove": "过去式", "driven": "过去分词"},
    "break": {"broke": "过去式", "broken": "过去分词"},
    "wear": {"wore": "过去式", "worn": "过去分词"},
    "choose": {"chose": "过去式", "chosen": "过去分词"},
    "teach": {"taught": "过去式 / 过去分词"},
    "catch": {"caught": "过去式 / 过去分词"},
    "throw": {"threw": "过去式", "thrown": "过去分词"},
    "fly": {"flew": "过去式", "flown": "过去分词"},
    "forget": {"forgot": "过去式", "forgotten": "过去分词"},
    "freeze": {"froze": "过去式", "frozen": "过去分词"},
    "hide": {"hid": "过去式", "hidden": "过去分词"},
    "ride": {"rode": "过去式", "ridden": "过去分词"},
    "ring": {"rang": "过去式", "rung": "过去分词"},
    "rise": {"rose": "过去式", "risen": "过去分词"},
    "seek": {"sought": "过去式 / 过去分词"},
    "sell": {"sold": "过去式 / 过去分词"},
    "shake": {"shook": "过去式", "shaken": "过去分词"},
    "shine": {"shone": "过去式 / 过去分词"},
    "shoot": {"shot": "过去式 / 过去分词"},
    "sing": {"sang": "过去式", "sung": "过去分词"},
    "sink": {"sank": "过去式", "sunk": "过去分词"},
    "sleep": {"slept": "过去式 / 过去分词"},
    "slide": {"slid": "过去式 / 过去分词"},
    "steal": {"stole": "过去式", "stolen": "过去分词"},
    "stick": {"stuck": "过去式 / 过去分词"},
    "strike": {"struck": "过去式", "stricken": "过去分词"},
    "swear": {"swore": "过去式", "sworn": "过去分词"},
    "sweep": {"swept": "过去式 / 过去分词"},
    "swim": {"swam": "过去式", "swum": "过去分词"},
    "swing": {"swung": "过去式 / 过去分词"},
    "tear": {"tore": "过去式", "torn": "过去分词"},
    "wake": {"woke": "过去式", "woken": "过去分词"},
    "feed": {"fed": "过去式 / 过去分词"},
    "fight": {"fought": "过去式 / 过去分词"},
    "flee": {"fled": "过去式 / 过去分词"},
    "bend": {"bent": "过去式 / 过去分词"},
    "bite": {"bit": "过去式", "bitten": "过去分词"},
    "blow": {"blew": "过去式", "blown": "过去分词"},
    "deal": {"dealt": "过去式 / 过去分词"},
    "dig": {"dug": "过去式 / 过去分词"},
    "draw": {"drew": "过去式", "drawn": "过去分词"},
    "drink": {"drank": "过去式", "drunk": "过去分词"},
    "eat": {"ate": "过去式", "eaten": "过去分词"},
    "lie": {"lay": "过去式", "lain": "过去分词"},
    "light": {"lit": "过去式 / 过去分词"},
    "mistake": {"mistook": "过去式", "mistaken": "过去分词"},
    "overcome": {"overcame": "过去式"},
    "prove": {"proved": "过去式", "proven": "过去分词"},
    "sew": {"sewed": "过去式", "sewn": "过去分词"},
    "shrink": {"shrank": "过去式", "shrunk": "过去分词"},
    "sow": {"sowed": "过去式", "sown": "过去分词"},
    "spring": {"sprang": "过去式", "sprung": "过去分词"},
    "sting": {"stung": "过去式 / 过去分词"},
    "stink": {"stank": "过去式", "stunk": "过去分词"},
    "strive": {"strove": "过去式", "striven": "过去分词"},
    "swell": {"swelled": "过去式", "swollen": "过去分词"},
    "weave": {"wove": "过去式", "woven": "过去分词"},
    "weep": {"wept": "过去式 / 过去分词"},
    "wind": {"wound": "过去式 / 过去分词"},
    "wring": {"wrung": "过去式 / 过去分词"},
    "arise": {"arose": "过去式", "arisen": "过去分词"},
    "awake": {"awoke": "过去式", "awoken": "过去分词"},
    "bear": {"bore": "过去式", "borne": "过去分词"},
    "beat": {"beaten": "过去分词"},
    "bind": {"bound": "过去式 / 过去分词"},
    "bleed": {"bled": "过去式 / 过去分词"},
    "breed": {"bred": "过去式 / 过去分词"},
    "cling": {"clung": "过去式 / 过去分词"},
    "creep": {"crept": "过去式 / 过去分词"},
    "dwell": {"dwelt": "过去式 / 过去分词"},
    "grind": {"ground": "过去式 / 过去分词"},
    "hang": {"hung": "过去式 / 过去分词"},
    "kneel": {"knelt": "过去式 / 过去分词"},
    "lay": {"laid": "过去式 / 过去分词"},
    "lend": {"lent": "过去式 / 过去分词"},
    "leap": {"leapt": "过去式 / 过去分词"},
    "spit": {"spat": "过去式 / 过去分词"},
    "split": {"split": "过去式 / 过去分词"},
    "spread": {"spread": "过去式 / 过去分词"},
    "shut": {"shut": "过去式 / 过去分词"},
    # irregular nouns
    "child": {"children": "复数"},
    "person": {"people": "复数"},
    "man": {"men": "复数"},
    "woman": {"women": "复数"},
    "mouse": {"mice": "复数"},
    "goose": {"geese": "复数"},
    "foot": {"feet": "复数"},
    "tooth": {"teeth": "复数"},
    "ox": {"oxen": "复数"},
    "datum": {"data": "复数"},
    "criterion": {"criteria": "复数"},
    "phenomenon": {"phenomena": "复数"},
    "index": {"indices": "复数", "indexes": "复数"},
    "analysis": {"analyses": "复数"},
    "crisis": {"crises": "复数"},
    "thesis": {"theses": "复数"},
    "hypothesis": {"hypotheses": "复数"},
    "basis": {"bases": "复数"},
    "diagnosis": {"diagnoses": "复数"},
    "oasis": {"oases": "复数"},
    "leaf": {"leaves": "复数"},
    "life": {"lives": "复数"},
    "knife": {"knives": "复数"},
    "wife": {"wives": "复数"},
    "wolf": {"wolves": "复数"},
    "shelf": {"shelves": "复数"},
    "half": {"halves": "复数"},
    "loaf": {"loaves": "复数"},
    "calf": {"calves": "复数"},
    "thief": {"thieves": "复数"},
    "scarf": {"scarves": "复数"},
    "self": {"selves": "复数"},
    "elf": {"elves": "复数"},
    "cactus": {"cacti": "复数"},
    "fungus": {"fungi": "复数"},
    "nucleus": {"nuclei": "复数"},
    "syllabus": {"syllabi": "复数"},
    "alumnus": {"alumni": "复数"},
    "medium": {"media": "复数"},
    "bacterium": {"bacteria": "复数"},
    "curriculum": {"curricula": "复数"},
    "matrix": {"matrices": "复数"},
    "vertex": {"vertices": "复数"},
    "appendix": {"appendices": "复数"},
    # irregular adjectives
    "good": {"better": "比较级", "best": "最高级"},
    "bad": {"worse": "比较级", "worst": "最高级"},
    "far": {"farther": "比较级", "farthest": "最高级", "further": "比较级", "furthest": "最高级"},
    "little": {"less": "比较级", "least": "最高级"},
    "many": {"more": "比较级", "most": "最高级"},
    "much": {"more": "比较级", "most": "最高级"},
    "old": {"elder": "比较级", "eldest": "最高级"},
}

IRREGULAR_REVERSE: dict[str, tuple[str, str]] = {}
for _base, _forms in IRREGULAR_FORMS.items():
    for _form, _label in _forms.items():
        IRREGULAR_REVERSE.setdefault(_form, (_base, _label))

# Words which happen to end in -s / -ed / -ing but should not be stripped.
UNINFLECTED = {
    "news",
    "series",
    "species",
    "means",
    "physics",
    "mathematics",
    "economics",
    "politics",
    "ethics",
    "athletics",
    "gymnastics",
    "chaos",
    "gas",
    "bus",
    "plus",
    "this",
    "his",
    "its",
    "us",
    "as",
    "is",
    "was",
    "yes",
    "always",
    "perhaps",
    "across",
    "unless",
}

ED_EXCEPTIONS = {
    "bed",
    "red",
    "shed",
    "sled",
    "wed",
    "need",
    "feed",
    "seed",
    "speed",
    "deed",
    "reed",
    "weed",
    "hundred",
    "naked",
    "wicked",
    "sacred",
    "rugged",
    "aged",
}

ING_EXCEPTIONS = {
    "thing",
    "nothing",
    "something",
    "anything",
    "everything",
    "morning",
    "evening",
    "ceiling",
    "during",
    "string",
    "spring",
    "bring",
}


def normalize(value: str) -> str:
    """Normalize capitalization, curly apostrophes and repeated spaces."""
    value = value.replace("’", "'").strip().lower()
    return re.sub(r"\s+", " ", value)


def _add(candidates: set[str], value: str, *, allow_short: bool = False) -> None:
    value = value.strip()
    if not value or not WORD_RE.fullmatch(value):
        return
    if allow_short or len(value) >= 3:
        candidates.add(value)


def lemma_candidates(word: str) -> set[str]:
    """Return plausible dictionary forms for an inflected word.

    The exact input is always included, so callers can treat this as a broad
    candidate set rather than a single guess.
    """
    word = normalize(word)
    candidates: set[str] = {word}
    if not word:
        return candidates

    irregular = IRREGULAR_REVERSE.get(word)
    if irregular:
        base, _label = irregular
        _add(candidates, base, allow_short=True)

    if word.endswith("'s"):
        _add(candidates, word[:-2])

    # plural / third-person singular
    if word.endswith("ies") and len(word) >= 5:
        _add(candidates, word[:-3] + "y")
    if word.endswith("ves") and len(word) >= 5:
        _add(candidates, word[:-3] + "f")
        _add(candidates, word[:-3] + "fe")
    if word.endswith("es") and len(word) >= 4:
        _add(candidates, word[:-2])
        _add(candidates, word[:-1])
    if (
        word.endswith("s")
        and not word.endswith(("ss", "us", "is"))
        and word not in UNINFLECTED
        and len(word) >= 4
    ):
        _add(candidates, word[:-1])

    # past tense / past participle
    if word.endswith("ied") and len(word) >= 5:
        _add(candidates, word[:-3] + "y")
    if word.endswith("ed") and len(word) >= 4 and word not in ED_EXCEPTIONS:
        stem = word[:-2]
        _add(candidates, stem)
        _add(candidates, stem + "e")
        if len(stem) >= 4 and stem[-1] == stem[-2] and stem[-1] not in "aeiouwxy":
            _add(candidates, stem[:-1])

    # present participle
    if word.endswith("ying") and len(word) >= 6:
        _add(candidates, word[:-4] + "ie")
    if word.endswith("ing") and len(word) >= 5 and word not in ING_EXCEPTIONS:
        stem = word[:-3]
        _add(candidates, stem)
        _add(candidates, stem + "e")
        if len(stem) >= 4 and stem[-1] == stem[-2] and stem[-1] not in "aeiouwxy":
            _add(candidates, stem[:-1])

    # comparative / superlative
    if word.endswith("ier") and len(word) >= 5:
        _add(candidates, word[:-3] + "y")
    if word.endswith("iest") and len(word) >= 6:
        _add(candidates, word[:-4] + "y")

    return candidates


def relation_label(query: str, headword: str) -> str:
    """A short human label describing how two forms are related."""
    query = normalize(query)
    headword = normalize(headword)
    if query == headword:
        return "原形"

    irregular = IRREGULAR_REVERSE.get(query)
    if irregular and irregular[0] == headword:
        return irregular[1]

    reverse = IRREGULAR_REVERSE.get(headword)
    if reverse and reverse[0] == query:
        return "原形"

    if query.endswith("iest"):
        return "最高级"
    if query.endswith("ier"):
        return "比较级"
    if query.endswith("ing"):
        return "现在分词"
    if query.endswith("ied") or query.endswith("ed"):
        return "过去式 / 过去分词"
    if query.endswith("ies") or query.endswith("es") or query.endswith("s"):
        return "复数 / 第三人称单数"
    if query.startswith(headword):
        return "同词形态"
    if headword.startswith(query):
        return "原形"
    return "相关形态"
