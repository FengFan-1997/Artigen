from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class IndexRow:
    character: str
    skin: str
    game: str


@dataclass(frozen=True)
class Localized:
    zh: str
    en: str


@dataclass(frozen=True)
class LocalizedIndexRow:
    character: Localized
    skin: Localized
    game: Localized


def _stable_int_seed(value: str) -> int:
    return int(hashlib.sha1(value.encode("utf-8")).hexdigest()[:8], 16)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _slug_to_words(slug: str) -> list[str]:
    parts = re.split(r"[_\-\s]+", slug.strip())
    return [p for p in parts if p]


def _split_bilingual(value: str) -> Localized:
    v = re.sub(r"\s+", " ", (value or "").strip())
    v = v.replace("**", "").strip()
    m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", v)
    if m:
        left = m.group(1).strip()
        inside = m.group(2).strip()
        if re.search(r"[\u4e00-\u9fff]", inside) and left:
            return Localized(zh=inside, en=left)
        if re.search(r"[\u4e00-\u9fff]", left) and inside:
            return Localized(zh=left, en=inside)
    if re.search(r"[\u4e00-\u9fff]", v):
        return Localized(zh=v, en=v)
    return Localized(zh=v, en=v)


def _split_skin(value: str) -> Localized:
    v = re.sub(r"\s+", " ", (value or "").strip())
    v = v.replace("**", "").replace("`", "").strip()
    if v.lower().startswith("default"):
        zh = v
        zh = re.sub(r"\bDefault\b", "默认", zh, flags=re.IGNORECASE)
        zh = re.sub(r"\bSkin\b", "换装", zh, flags=re.IGNORECASE)
        return Localized(zh=zh, en=v)
    m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", v)
    if m:
        left = m.group(1).strip()
        inside = m.group(2).strip()
        if re.search(r"[\u4e00-\u9fff]", inside) and left:
            return Localized(zh=inside, en=left)
        if re.search(r"[\u4e00-\u9fff]", left) and inside:
            return Localized(zh=left, en=inside)
    if re.search(r"[\u4e00-\u9fff]", v):
        return Localized(zh=v, en=v)
    return Localized(zh=v, en=v)


def _localize_game(value: Localized) -> Localized:
    en = value.en.strip()
    zh = value.zh.strip()
    game_map = {
        "Azur Lane": "碧蓝航线",
        "Girls' Frontline": "少女前线",
        "Girls’ Frontline": "少女前线",
    }
    if zh in game_map:
        return Localized(zh=game_map[zh], en=en or zh)
    if en in game_map and (not zh or zh == en):
        return Localized(zh=game_map[en], en=en)
    return value


def _parse_index_from_readme(readme_text: str) -> dict[str, IndexRow]:
    rows: dict[str, IndexRow] = {}
    for line in readme_text.splitlines():
        if not line.strip().startswith("|"):
            continue
        cols = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cols) < 4:
            continue
        if all(re.fullmatch(r"[:\-\s]+", c or "") for c in cols):
            continue
        link_col = cols[-1]
        m = re.search(r"\(([^)]+\.md)\)", link_col)
        if not m:
            continue
        rel = m.group(1).strip()
        rows[rel] = IndexRow(character=cols[0].strip(), skin=cols[1].strip(), game=cols[2].strip())
    return rows


def _localize_index_rows(rows: dict[str, IndexRow]) -> dict[str, LocalizedIndexRow]:
    out: dict[str, LocalizedIndexRow] = {}
    for rel, row in rows.items():
        game = _localize_game(_split_bilingual(row.game))
        out[rel] = LocalizedIndexRow(
            character=_split_bilingual(row.character),
            skin=_split_skin(row.skin),
            game=game,
        )
    return out


def _normalize_character_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    value = value.replace("**", "").strip()
    if not value:
        return value
    return value


def _sanitize_skin_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    value = value.replace("**", "").replace("`", "").strip()
    return value


KNOWN_DOCS: dict[str, LocalizedIndexRow] = {
    "qiye_7": LocalizedIndexRow(
        character=Localized(zh="企业", en="Enterprise"),
        skin=Localized(zh="换装 7", en="Skin 7"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "qiye_7_hx": LocalizedIndexRow(
        character=Localized(zh="企业", en="Enterprise"),
        skin=Localized(zh="换装 7（和谐版）", en="Skin 7 (Harmony Ver.)"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "qiye_9": LocalizedIndexRow(
        character=Localized(zh="企业", en="Enterprise"),
        skin=Localized(zh="换装 9", en="Skin 9"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "shengluyisi_2": LocalizedIndexRow(
        character=Localized(zh="圣路易斯", en="St. Louis"),
        skin=Localized(zh="换装 2", en="Skin 2"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "shengluyisi_2_hx": LocalizedIndexRow(
        character=Localized(zh="圣路易斯", en="St. Louis"),
        skin=Localized(zh="换装 2（和谐版）", en="Skin 2 (Harmony Ver.)"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "shengluyisi_3": LocalizedIndexRow(
        character=Localized(zh="圣路易斯", en="St. Louis"),
        skin=Localized(zh="换装 3", en="Skin 3"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "shengluyisi_4": LocalizedIndexRow(
        character=Localized(zh="圣路易斯", en="St. Louis"),
        skin=Localized(zh="换装 4", en="Skin 4"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "shengluyisi_5": LocalizedIndexRow(
        character=Localized(zh="圣路易斯", en="St. Louis"),
        skin=Localized(zh="换装 5", en="Skin 5"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "tianlangxing_3": LocalizedIndexRow(
        character=Localized(zh="天狼星", en="Sirius"),
        skin=Localized(zh="换装 3", en="Skin 3"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "tianlangxing_5": LocalizedIndexRow(
        character=Localized(zh="天狼星", en="Sirius"),
        skin=Localized(zh="换装 5", en="Skin 5"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "xianghe_2": LocalizedIndexRow(
        character=Localized(zh="翔鹤", en="Shoukaku"),
        skin=Localized(zh="换装 2", en="Skin 2"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "yingxianzuo_3": LocalizedIndexRow(
        character=Localized(zh="英仙座", en="Perseus"),
        skin=Localized(zh="换装 3", en="Skin 3"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "maliluosi_3_doa": LocalizedIndexRow(
        character=Localized(zh="玛丽·萝丝", en="Marie Rose"),
        skin=Localized(zh="联动换装 3（DOA）", en="Collab Skin 3 (DOA)"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "dafeng_variants": LocalizedIndexRow(
        character=Localized(zh="大凤", en="Taihou"),
        skin=Localized(zh="多换装汇总", en="Variants Summary"),
        game=Localized(zh="碧蓝航线", en="Azur Lane"),
    ),
    "ZiYuXin": LocalizedIndexRow(
        character=Localized(zh="闪电", en="OTs-14"),
        skin=Localized(zh="紫雨心（合集索引）", en="ZiYuXin (Collection Index)"),
        game=Localized(zh="少女前线", en="Girls' Frontline"),
    ),
    "ots14_4501_copy": LocalizedIndexRow(
        character=Localized(zh="闪电", en="OTs-14"),
        skin=Localized(zh="换装 4501（副本）", en="Skin 4501 (Copy)"),
        game=Localized(zh="少女前线", en="Girls' Frontline"),
    ),
}


def _first_match(text: str, patterns: list[str]) -> str | None:
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE | re.MULTILINE)
        if m:
            return m.group(1).strip()
    return None


def _guess_from_source_text(md_text: str) -> tuple[str, str, str]:
    character = _first_match(
        md_text,
        [
            r"^\s*-\s*\*\*(?:名称|Name)\*\*\s*[:：]\s*(.+?)\s*$",
            r"^\s*##\s*1\.\s*(?:角色档案|Character Profile).*$[\s\S]*?^\s*-\s*\*\*(?:名称|Name)\*\*\s*:\s*(.+?)\s*$",
        ],
    )
    game = _first_match(
        md_text,
        [
            r"^\s*-\s*\*\*(?:原作|Source)\*\*\s*[:：]\s*(.+?)\s*$",
            r"^\s*-\s*\*\*(?:来源|Game)\*\*\s*[:：]\s*(.+?)\s*$",
        ],
    )
    skin = _first_match(
        md_text,
        [
            r"^\s*-\s*\*\*(?:皮肤\s*ID|Variant)\*\*\s*[:：]\s*(.+?)\s*$",
            r"^\s*#\s*(?:模型索引|Model Index)\s*[:：]\s*(.+?)\s*$",
        ],
    )
    return (_normalize_character_name(character or ""), skin or "", game or "")


def _detect_model_dir(repo_root: Path, rel_md_path: Path) -> Path | None:
    doc_id = rel_md_path.stem
    parent = rel_md_path.parent
    candidates = [
        repo_root / parent / doc_id,
        repo_root / rel_md_path.parts[0] / doc_id if rel_md_path.parts else None,
    ]
    for c in candidates:
        if c and c.exists() and c.is_dir():
            return c
    return None


def _list_motion_files(model_dir: Path) -> list[str]:
    motions_dir = model_dir / "motions"
    if not motions_dir.exists() or not motions_dir.is_dir():
        return []
    names: list[str] = []
    for p in sorted(motions_dir.rglob("*")):
        if not p.is_file():
            continue
        if p.name.endswith(".motion3.json"):
            rel = p.relative_to(motions_dir).as_posix()
            names.append(rel.replace(".motion3.json", ""))
        elif p.name.endswith(".mtn"):
            rel = p.relative_to(motions_dir).as_posix()
            names.append(rel.replace(".mtn", ""))
        elif p.name.endswith(".json") and p.name in {"model.json", "expressions.json", "physics.json"}:
            continue
    return names


def _motion_groups(motions: list[str]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    for m in motions:
        key = m.split("/")[0] if "/" in m else m
        groups.setdefault(key, []).append(m)
    return groups


def _extract_hf_url(md_text: str) -> str | None:
    m = re.search(r"(https?://huggingface\.co/[^\s)]+)", md_text)
    if not m:
        return None
    url = m.group(1).strip()
    url = url.strip("`\"'")
    url = url.rstrip("`\"'")
    return url


def _extract_local_path(md_text: str) -> str | None:
    m = re.search(r"(/Users/[^\s`]+/mode/model/[^\s`]+)", md_text)
    return m.group(1).strip() if m else None


def _cn_trigger_hint(motion: str) -> str:
    m = motion.lower()
    if "login" in m:
        return "登录 / 进入界面"
    if "mail" in m:
        return "邮件提示"
    if "mission_complete" in m or m.endswith("/complete") or m == "complete":
        return "任务完成"
    if "mission" in m:
        return "任务相关"
    if "touch" in m or "shake" in m or "drag" in m:
        return "触摸交互"
    if "wedding" in m:
        return "誓约 / 仪式"
    if m.startswith("main"):
        return "主界面对话"
    if "home" in m:
        return "主页 / 返回"
    if m.startswith("idle") or m.startswith("daiji") or m.startswith("wait"):
        return "待机循环 / 主页"
    if "effect" in m:
        return "演出 / 特效"
    return "剧情/展示"


def _en_trigger_hint(motion: str) -> str:
    m = motion.lower()
    if "login" in m:
        return "Login / Enter UI"
    if "mail" in m:
        return "Mail notification"
    if "mission_complete" in m or m.endswith("/complete") or m == "complete":
        return "Mission completion"
    if "mission" in m:
        return "Mission related"
    if "touch" in m or "shake" in m or "drag" in m:
        return "Touch interaction"
    if "wedding" in m:
        return "Oath / Ceremony"
    if m.startswith("main"):
        return "Home dialogue"
    if "home" in m:
        return "Home / Return"
    if m.startswith("idle") or m.startswith("daiji") or m.startswith("wait"):
        return "Idle loop / Home"
    if "effect" in m:
        return "Showcase / Effects"
    return "Showcase / Scene"


def _theme_tokens(skin: str, doc_id: str) -> list[str]:
    text = f"{skin} {doc_id}".lower()
    tokens: list[str] = []
    if any(k in text for k in ["wedding", "誓约", "oath", "婚", "wedding_touch"]):
        tokens.append("wedding")
    if any(k in text for k in ["school", "毕业", "校", "制服", "graduation"]):
        tokens.append("school")
    if any(k in text for k in ["swim", "beach", "海", "夏", "seaside", "suit"]):
        tokens.append("seaside")
    if any(k in text for k in ["new year", "新年", "spring", "正月", "year"]):
        tokens.append("newyear")
    if any(k in text for k in ["maid", "女仆", "service"]):
        tokens.append("maid")
    if any(k in text for k in ["race", "queen", "旗袍", "礼服", "dress"]):
        tokens.append("dress")
    if "hx" in doc_id or any(k in text for k in ["hexie", "和谐", "censor"]):
        tokens.append("hx")
    return tokens or ["default"]


def _pick(seq: list[str], n: int, seed: int) -> list[str]:
    if not seq or n <= 0:
        return []
    out: list[str] = []
    x = seed
    for _ in range(n):
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        out.append(seq[x % len(seq)])
    return out


def _sample(seq: list[str], n: int, seed: int) -> list[str]:
    if not seq or n <= 0:
        return []
    items = list(seq)
    x = seed
    for i in range(len(items) - 1, 0, -1):
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        j = x % (i + 1)
        items[i], items[j] = items[j], items[i]
    if n <= len(items):
        return items[:n]
    out = items[:]
    while len(out) < n:
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        out.append(items[x % len(items)])
    return out


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it in seen:
            continue
        seen.add(it)
        out.append(it)
    return out


def _cn_personality(seed: int, themes: list[str]) -> tuple[list[str], list[str]]:
    cores = [
        "克制自律，先观察再行动",
        "表面冷静，情绪只留给最信任的人",
        "自尊心强，做事追求绝对的体面与秩序",
        "对他人要求严格，但对自己更苛刻",
        "嘴上不饶人，心里却会默默补上关照",
        "擅长把复杂事情拆成清晰的步骤",
    ]
    add = [
        "在亲密关系里反而容易害羞，常用转移话题来掩饰",
        "听到认可会短暂沉默，然后用行动回应",
        "在压力场景里语速更稳，句子更短",
        "不喜欢被围观，越被注视越装作若无其事",
        "对“责任”二字有近乎固执的执念",
        "对“承诺”很认真，说出口就会兑现到底",
    ]
    if "maid" in themes:
        add += ["把“服务”当成技术活，讲究流程与细节", "会把命令改写成更高效的执行清单再去做"]
    if "wedding" in themes:
        add += ["对誓言极其郑重，语气会明显柔和", "会把“未来”放进日常的每个小决定里"]
    if "hx" in themes:
        add += ["表达更含蓄，亲密互动会用玩笑或礼貌包装", "更强调“分寸”与“界限感”"]
    core_picks = _dedupe_keep_order(_pick(cores, 3, seed))
    add_picks = _dedupe_keep_order(_pick(add, 4, seed ^ 0xA5A5A5))
    keywords = [
        "克制",
        "可靠",
        "认真",
        "自尊",
        "温柔但不直说",
        "原则",
        "护短",
        "效率",
        "审美洁癖",
        "仪式感",
    ]
    kw_picks = _dedupe_keep_order(_pick(keywords, 6, seed ^ 0x5A5A5A))
    return core_picks + add_picks, kw_picks


def _en_personality(seed: int, themes: list[str]) -> tuple[list[str], list[str]]:
    cores = [
        "disciplined and deliberate, acts after observing",
        "calm on the surface, warm only with trusted people",
        "proud and detail-oriented, values composure and order",
        "demanding to others, even harsher to self",
        "sharp-tongued but quietly protective",
        "turns chaos into clear, actionable steps",
    ]
    add = [
        "gets shy in closeness and deflects with practical talk",
        "answers praise with a pause, then with action",
        "shorter sentences under pressure, steadier cadence",
        "acts unfazed when watched, even if flustered inside",
        "takes responsibility personally and seriously",
        "treats promises as contracts: said means done",
    ]
    if "maid" in themes:
        add += ["treats service as craftsmanship with impeccable routines", "rewrites requests into efficient checklists"]
    if "wedding" in themes:
        add += ["softens noticeably when vows are mentioned", "lets the future guide small daily choices"]
    if "hx" in themes:
        add += ["more restrained, uses polite framing for intimacy", "emphasizes boundaries and timing"]
    core_picks = _dedupe_keep_order(_pick(cores, 3, seed))
    add_picks = _dedupe_keep_order(_pick(add, 4, seed ^ 0xA5A5A5))
    keywords = [
        "composed",
        "reliable",
        "serious",
        "proud",
        "soft-spoken warmth",
        "principled",
        "protective",
        "efficient",
        "aesthetic-minded",
        "ritualistic",
    ]
    kw_picks = _dedupe_keep_order(_pick(keywords, 6, seed ^ 0x5A5A5A))
    return core_picks + add_picks, kw_picks


def _cn_skin_unique(seed: int, character: str, skin: str, themes: list[str]) -> dict[str, list[str]]:
    appearance_pool = [
        "材质对比更强：硬挺外层 + 柔软内搭，动作时褶皱层次明显",
        "配饰更醒目：发饰/领结/胸针会随着呼吸与转身轻微摆动",
        "视线更大胆：看人更久、回避更少，像在确认你的回应",
        "手部更有戏：整理衣领、按住帽檐、轻敲指节等小动作更频繁",
        "步伐更轻：重心更靠后，转身更像“滑步”而不是“踏步”",
        "表情更细：微笑幅度小，但眼睛的弧度变化更丰富",
    ]
    mood_pool = [
        "整体更像“控制住情绪的亲近”，不甜腻但很黏人",
        "带一点“逗弄”，每次靠近都像在试探你的底线",
        "更“仪式感”，说话会加一句收尾确认",
        "更“生活化”，把浪漫藏在提醒与叮嘱里",
        "更“舞台感”，动作更大、停顿更长，像在等掌声",
        "更“私密感”，音量更低、距离更近，像只说给你听",
    ]
    taboo_pool = [
        "别用命令式语气逼她表态，她会先冷下来再转身去做事",
        "别当众调侃她的亲密反应，她会用礼貌把你“请”回正轨",
        "别把她的认真当玩笑，她会把你的玩笑当成失信",
        "别反复打断她的步骤，她需要完整的节奏来维持耐心",
        "别在她低声说话时大声起哄，她会立刻拉开距离",
        "别在她提醒你休息时敷衍，她会把照顾升级成监督",
    ]
    if "wedding" in themes:
        appearance_pool += ["会更强调戒指/誓约象征物的镜头感，手部停留更久"]
        mood_pool += ["更柔更慢，常用“我们”而不是“你/我”"]
        taboo_pool += ["别用轻佻语气提“誓约”，她会立刻严肃起来"]
    if "school" in themes:
        appearance_pool += ["动作更青春：抬手遮光、轻摇课本、把发丝别到耳后"]
        mood_pool += ["更像“被抓到偷看”的害羞，会先否认再轻咳"]
        taboo_pool += ["别拿成绩或考试开过火玩笑，她会立刻进入严师模式"]
    if "seaside" in themes:
        appearance_pool += ["身体动态更明显：呼吸、摆尾、飘带的摆动更突出"]
        mood_pool += ["更放松，偶尔会笑出声再迅速收住"]
        taboo_pool += ["别强行要求她摆“可爱姿势”，她会用高冷把你按回去"]
    if "maid" in themes:
        appearance_pool += ["动作更讲究服务礼节：微鞠躬、引导手势、托盘式手型"]
        mood_pool += ["更像“专业的温柔”，会先问需求再给方案"]
        taboo_pool += ["别把她当成随叫随到的工具人，她会用效率反制你"]
    if "hx" in themes:
        taboo_pool += ["别试图越界，她会用“规矩”把气氛重新整理"]
    return {
        "appearance": _dedupe_keep_order(_pick(appearance_pool, 6, seed)),
        "mood": _dedupe_keep_order(_pick(mood_pool, 4, seed ^ 0x222222)),
        "taboo": _dedupe_keep_order(_pick(taboo_pool, 4, seed ^ 0x333333)),
    }


def _en_skin_unique(seed: int, themes: list[str]) -> dict[str, list[str]]:
    appearance_pool = [
        "stronger material contrast: structured outer layer + soft inner fabric",
        "more visible accessories: hair ornaments/brooches sway with breathing",
        "bolder gaze: holds eye contact longer to read your response",
        "busier hands: collar fixing, brim pressing, finger tapping",
        "lighter steps: weight sits back, turns feel like a glide",
        "finer expressions: small smiles but rich eye-shape changes",
    ]
    mood_pool = [
        "controlled closeness: not sugary, but quietly clingy",
        "a teasing edge, each approach tests your boundaries",
        "more ritualistic: ends lines with a soft confirmation",
        "romance hidden in reminders and practical care",
        "stage-like beats: bigger gestures and longer pauses",
        "private intimacy: lower volume, closer distance, meant only for you",
    ]
    taboo_pool = [
        "don’t force a confession with a commanding tone; she cools down first",
        "don’t tease her intimate reactions in public; she will reset the mood",
        "don’t treat her seriousness as a joke; she reads it as broken trust",
        "don’t interrupt her step-by-step flow; she needs rhythm to stay patient",
        "don’t hype loudly when she speaks softly; she will create distance",
        "don’t brush off her rest reminders; care turns into supervision",
    ]
    if "wedding" in themes:
        appearance_pool += ["lingers on ring/vow symbols; hands stay in frame longer"]
        mood_pool += ["softer and slower; uses 'we' more than 'you/I'"]
        taboo_pool += ["don’t speak lightly about vows; she becomes serious immediately"]
    if "school" in themes:
        appearance_pool += ["youthful micro-actions: shading eyes, flipping a book, tucking hair"]
        mood_pool += ["caught-looking shyness: denies first, then clears her throat"]
        taboo_pool += ["don’t push exam jokes too far; she switches to strict-teacher mode"]
    if "seaside" in themes:
        appearance_pool += ["stronger body dynamics: breathing, ribbons, and sways stand out"]
        mood_pool += ["more relaxed; sometimes laughs, then quickly reins it in"]
        taboo_pool += ["don’t force 'cute poses'; she will ice you back into place"]
    if "maid" in themes:
        appearance_pool += ["service etiquette: small bows, guiding gestures, tray-like hands"]
        mood_pool += ["professional warmth: asks your needs, then proposes a plan"]
        taboo_pool += ["don’t treat her as on-call labor; she counters with efficiency"]
    if "hx" in themes:
        taboo_pool += ["don’t push past boundaries; she will tidy the atmosphere with rules"]
    return {
        "appearance": _dedupe_keep_order(_pick(appearance_pool, 6, seed)),
        "mood": _dedupe_keep_order(_pick(mood_pool, 4, seed ^ 0x222222)),
        "taboo": _dedupe_keep_order(_pick(taboo_pool, 4, seed ^ 0x333333)),
    }


def _cn_directing_notes(seed: int, character: str, skin: str, themes: list[str]) -> list[str]:
    pool = [
        "说话前先停半拍，像在确认你有没有听懂",
        "肯定句收尾要干净，避免拖尾语气词",
        "被夸奖时先移开视线，再回到你身上",
        "触摸反应从“克制”开始，第二句才放软",
        "遇到不合规请求，先给理由再给替代方案",
        "动作节奏：起势快、停顿长、收势轻",
        "笑不要太大，更多用眼睛来笑",
        "亲密台词少用叠词，多用“确认/承诺”",
    ]
    if "wedding" in themes:
        pool += ["提到誓言时音量降低，像把一句话放进掌心", "对“未来”类词汇停顿更明显"]
    if "maid" in themes:
        pool += ["服务用语要专业，但夹一点轻微的占有欲", "对流程描述要具体到动作细节"]
    if "seaside" in themes:
        pool += ["语气更松，偶尔带笑，但立刻收回克制", "动作里要有被风吹动的停顿感"]
    if "school" in themes:
        pool += ["更年轻的节奏：快一点、短一点，但别失礼", "被调侃时轻咳一声再反击"]
    if "hx" in themes:
        pool += ["亲密表达更含蓄，用“规矩/分寸”来遮住害羞"]
    picks = _dedupe_keep_order(_pick(pool, 8, seed ^ 0xF00D))
    return [f"- {p}" for p in picks]


def _en_directing_notes(seed: int, themes: list[str]) -> list[str]:
    pool = [
        "pause half a beat before speaking, as if checking you’re listening",
        "end affirmations cleanly; avoid trailing filler",
        "look away on praise, then return to eye contact",
        "touch reactions start restrained; soften on the second line",
        "for invalid requests, give a reason, then offer an alternative",
        "motion rhythm: quick start, long hold, light finish",
        "keep smiles small; let the eyes do the work",
        "for intimacy, use confirmation and promises over cutesy repetition",
    ]
    if "wedding" in themes:
        pool += ["lower volume when vows come up, like words kept in a palm", "longer pauses around 'future' phrasing"]
    if "maid" in themes:
        pool += ["professional service phrasing with a hint of possessiveness", "describe routines down to hand movements"]
    if "seaside" in themes:
        pool += ["looser tone, a brief laugh, then composure returns", "motions should include wind-like pauses"]
    if "school" in themes:
        pool += ["slightly quicker, shorter lines without losing politeness", "a small throat-clear before a comeback"]
    if "hx" in themes:
        pool += ["more restrained intimacy, hides shyness behind 'proper timing'"]
    picks = _dedupe_keep_order(_pick(pool, 8, seed ^ 0xF00D))
    return [f"- {p}" for p in picks]


def _cn_voice_lines(seed: int, character: str, skin: str, themes: list[str], motion_keys: list[str]) -> dict[str, list[str]]:
    signature = _pick(
        [
            "别走神，跟上我的节奏",
            "把手给我，我带你稳住",
            "现在，听我一次",
            "别怕，我在",
            "要我说第二遍吗？",
            "嗯？你在想什么",
            "我记住了",
            "你做得很好",
        ],
        1,
        seed ^ 0x13579,
    )[0]

    def mk(pool: list[str], n: int, salt: int) -> list[str]:
        picked = _sample(pool, n, seed ^ salt)
        out: list[str] = []
        for i, p in enumerate(picked, start=1):
            out.append(f"{i}. {p}")
        return out

    base_greet = [
        f"指挥官，欢迎回来。{signature}",
        "我已经把今天的优先事项整理好了，你只需要点头。",
        "如果你累了，就先坐下。剩下的交给我。",
        "你来得正好，我刚做完检查，没有问题。",
        "别急，先看我一眼——确认你安全，再谈别的。",
    ]
    base_idle = [
        "风向和节奏都很正常……你呢？心跳也要正常。",
        "别把压力吞下去。说出来，我帮你拆开处理。",
        "我不喜欢等待，但如果是等你，我可以。",
        "你不说话也行。我在这里就够了。",
        f"你今天的表情……我会记住。{signature}",
        "把手放好，别乱动。对，我说的是你。",
        "有时候安静比誓言更重。我懂。",
        "你把目光给我一秒，我就能判断你是不是在逞强。",
    ]
    head = [
        "别摸头……我不是小孩子。……不过，别停太久。",
        "手很暖。你想安抚我，还是想被我安抚？",
        "轻一点。发丝会乱，但我不讨厌。",
        "你这样会让我分神。后果你负责。",
    ]
    body = [
        "注意分寸。现在是工作时间——至少先装作是。",
        "你靠得太近了。……我没有退开，不代表允许放肆。",
        "想确认我在？那就用眼睛。",
        "再来一次我就要反击了。别怪我。",
    ]
    special = [
        "你确定要继续？我不会在这种事上放水。",
        "我不喜欢被试探。想要就说清楚。",
        f"你在挑战我的耐心。{signature}",
        "别以为我会脸红就会退让。",
    ]
    mission = [
        "任务清单我已经排好。你负责选择，我负责完成。",
        "别拖延。现在行动，风险最低。",
        "你给我一个目标，我给你一个结果。",
    ]
    mail = [
        "有新的通讯。要我替你筛掉废话吗？",
        "信件到达。我建议你先看关键句。",
    ]
    wedding = [
        "誓言不是用来好听的，是用来实现的。",
        "从今天起，你的未来也在我的责任范围内。",
        f"如果你害怕，我就握紧一点。{signature}",
    ]
    combat = [
        "站到我身后。别逞强，我会把你护住。",
        "目标锁定。让开，我来。",
        "保持呼吸，保持节奏——我们一起。",
        "别眨眼。结束很快。",
    ]

    if "maid" in themes:
        base_greet += ["欢迎回到“你的席位”。先喝水，再下指令。", "我会把你的任性也收拾得体面。"]
        base_idle += ["服务不是讨好，是让你更强。记住。", "你不需要装坚强，至少在我面前不用。"]
    if "seaside" in themes:
        base_greet += ["海风有点凉。过来，我替你挡一下。", "别站那么远，浪花会溅到你。"]
        base_idle += ["你听，浪声像呼吸。跟着它慢下来。", "晒伤会痛。别硬撑，我会提醒你。"]
    if "school" in themes:
        base_greet += ["迟到可不行。……算了，这次我当没看见。", "书包给我，我帮你拿。别嘴硬。"]
        base_idle += ["认真一点。你看我都在学习，你也要。", "别在课上走神。看我。"]
    if "hx" in themes:
        special = [
            "现在不合适。把这份心思先收起来，等我点头。",
            "你想越界？先学会遵守。",
            f"别急。{signature} 我会给你答案，但不是现在。",
            "我会靠近你，但要按我的节奏。",
        ]

    sections: dict[str, list[str]] = {}

    if any(k in motion_keys for k in ["login", "home"]):
        sections["登录 / 问候"] = mk(base_greet, 8, 0x10)
    if any(k.startswith("idle") or k == "daiji_idle_01" for k in motion_keys):
        sections["待机 / 秘书"] = mk(base_idle, 12, 0x11)
    if any("mail" in k for k in motion_keys):
        sections["邮件 / 通讯"] = mk(mail, 4, 0x12)
    if any("mission" in k or "complete" in k for k in motion_keys):
        sections["任务 / 完成"] = mk(mission, 6, 0x13)
    if any("touch_head" in k for k in motion_keys):
        sections["触摸：头部"] = mk(head, 8, 0x14)
    if any("touch_body" in k or "touch_1" in k for k in motion_keys):
        sections["触摸：身体"] = mk(body, 8, 0x15)
    if any("touch_special" in k or "wedding_touch" in k for k in motion_keys):
        sections["触摸：特殊"] = mk(special, 8, 0x16)
    if any("wedding" in k for k in motion_keys):
        sections["誓约 / 仪式"] = mk(wedding, 6, 0x17)
    sections["战斗 / 出击（风格参考）"] = mk(combat, 8, 0x18)

    if not sections:
        sections["语音（按动作数量生成）"] = mk(base_greet + base_idle + combat, 24, 0x19)

    return sections


def _en_voice_lines(seed: int, character: str, skin: str, themes: list[str], motion_keys: list[str]) -> dict[str, list[str]]:
    signature = _pick(
        [
            "Stay with my rhythm.",
            "Give me your hand. I’ll steady you.",
            "Now—listen to me once.",
            "Don’t worry. I’m here.",
            "Do you want me to repeat that?",
            "What are you thinking?",
            "I’ll remember this.",
            "You did well.",
        ],
        1,
        seed ^ 0x13579,
    )[0]

    def mk(pool: list[str], n: int, salt: int) -> list[str]:
        picked = _sample(pool, n, seed ^ salt)
        out: list[str] = []
        for i, p in enumerate(picked, start=1):
            out.append(f"{i}. {p}")
        return out

    base_greet = [
        f"Welcome back. {signature}",
        "I’ve sorted today’s priorities. You just need to approve.",
        "If you’re tired, sit. I’ll handle the rest.",
        "I finished the checks. No issues.",
        "Look at me first—then we talk.",
    ]
    base_idle = [
        "Everything’s stable… and you? Your heartbeat should be, too.",
        "Don’t swallow the pressure. Say it, and I’ll break it down with you.",
        "I dislike waiting. But for you, I can.",
        "You don’t need to speak. I’m here.",
        f"That expression… I’ll remember it. {signature}",
        "Hands where I can see them. Yes, I mean yours.",
        "Sometimes silence weighs more than vows. I know.",
        "Give me one second of your eyes and I’ll tell if you’re forcing it.",
    ]
    head = [
        "Don’t pat my head… I’m not a child. …Just not too long.",
        "Your hand is warm. Are you soothing me, or asking to be soothed?",
        "Gently. My hair will get messy—yet I don’t mind.",
        "You’ll make me lose focus. You’ll take responsibility.",
    ]
    body = [
        "Mind your timing. It’s work hours—at least pretend.",
        "Too close. …I’m not stepping back, but don’t mistake that for permission.",
        "If you want to confirm I’m here, use your eyes.",
        "Do that again and I’ll strike back. Don’t complain.",
    ]
    special = [
        "Are you sure? I don’t go easy on this.",
        "I don’t like being tested. If you want something, say it plainly.",
        f"You’re testing my patience. {signature}",
        "Don’t assume my blush means retreat.",
    ]
    mission = [
        "I arranged the task list. You choose; I deliver.",
        "No stalling. Move now—lowest risk.",
        "Give me a target. I’ll give you a result.",
    ]
    mail = [
        "New message. Want me to filter the noise?",
        "Mail arrived. I suggest you read the key lines first.",
    ]
    wedding = [
        "Vows aren’t for sounding nice. They’re for being kept.",
        "From today, your future is within my responsibility.",
        f"If you’re afraid, I’ll hold tighter. {signature}",
    ]
    combat = [
        "Behind me. Don’t force it—I’ll cover you.",
        "Target locked. Move aside.",
        "Breathe. Keep the rhythm—we do this together.",
        "Don’t blink. It ends quickly.",
    ]

    if "maid" in themes:
        base_greet += ["Welcome to your seat. Water first, then orders.", "I’ll tidy even your whims into something presentable."]
        base_idle += ["Service isn’t flattery. It’s making you stronger. Remember.", "You don’t have to be tough—at least not with me."]
    if "seaside" in themes:
        base_greet += ["The sea breeze is cold. Come here—I’ll block it.", "Don’t stand so far. The waves will reach you."]
        base_idle += ["Listen—waves sound like breathing. Slow down with it.", "Sunburn hurts. Don’t pretend. I’ll remind you."]
    if "school" in themes:
        base_greet += ["Late again? …Fine. This time I’ll pretend I didn’t see it.", "Give me your bag. Stop being stubborn."]
        base_idle += ["Focus. If I’m studying, you should too.", "Don’t drift in class. Look at me."]
    if "hx" in themes:
        special = [
            "Not now. Put that thought away until I say yes.",
            "You want to cross a line? Learn to respect it first.",
            f"Easy. {signature} I’ll answer you—just not yet.",
            "I’ll come closer, but on my tempo.",
        ]

    sections: dict[str, list[str]] = {}

    if any(k in motion_keys for k in ["login", "home"]):
        sections["Login / Greeting"] = mk(base_greet, 8, 0x10)
    if any(k.startswith("idle") or k == "daiji_idle_01" for k in motion_keys):
        sections["Idle / Secretary"] = mk(base_idle, 12, 0x11)
    if any("mail" in k for k in motion_keys):
        sections["Mail / Messages"] = mk(mail, 4, 0x12)
    if any("mission" in k or "complete" in k for k in motion_keys):
        sections["Missions / Completion"] = mk(mission, 6, 0x13)
    if any("touch_head" in k for k in motion_keys):
        sections["Touch: Head"] = mk(head, 8, 0x14)
    if any("touch_body" in k or "touch_1" in k for k in motion_keys):
        sections["Touch: Body"] = mk(body, 8, 0x15)
    if any("touch_special" in k or "wedding_touch" in k for k in motion_keys):
        sections["Touch: Special"] = mk(special, 8, 0x16)
    if any("wedding" in k for k in motion_keys):
        sections["Oath / Ceremony"] = mk(wedding, 6, 0x17)
    sections["Combat / Sortie (Style Reference)"] = mk(combat, 8, 0x18)

    if not sections:
        sections["Voice Lines (Generated by Motion Count)"] = mk(base_greet + base_idle + combat, 24, 0x19)

    return sections


def _cn_doc(
    rel_path: Path,
    index: LocalizedIndexRow | None,
    source_md: str,
    model_dir: Path | None,
) -> str:
    doc_id = rel_path.stem
    seed = _stable_int_seed(rel_path.as_posix())
    ch_guess, skin_guess, game_guess = _guess_from_source_text(source_md)
    if not index:
        index = KNOWN_DOCS.get(doc_id)
    character = _normalize_character_name((index.character.zh if index else ch_guess) or doc_id)
    skin = _sanitize_skin_name((index.skin.zh if index else skin_guess) or f"换装 {doc_id}")
    game = _normalize_character_name((index.game.zh if index else game_guess) or "")
    themes = _theme_tokens(skin, doc_id)

    motions = _list_motion_files(model_dir) if model_dir else []
    groups = _motion_groups(motions)
    motion_keys = sorted(groups.keys())

    hf = _extract_hf_url(source_md)
    local_path = _extract_local_path(source_md)
    if not local_path and model_dir:
        local_path = str(model_dir)

    personality, keywords = _cn_personality(seed, themes)
    unique = _cn_skin_unique(seed, character, skin, themes)
    directing = _cn_directing_notes(seed, character, skin, themes)
    voices = _cn_voice_lines(seed, character, skin, themes, motion_keys)

    motion_block_lines: list[str] = []
    if motions:
        motion_block_lines.append("| 动作键 / 文件名 | 触发建议 | 备注 |")
        motion_block_lines.append("| :--- | :--- | :--- |")
        for m in motions[:120]:
            hint = _cn_trigger_hint(m)
            note = _pick(
                [
                    "建议配合表情参数做微调",
                    "可随机触发以提升“活着”的感觉",
                    "适合在停顿处播一条短台词",
                    "适合配合镜头推近或轻微摇镜",
                    "建议限制频率，避免过于吵闹",
                ],
                1,
                seed ^ _stable_int_seed(m),
            )[0]
            motion_block_lines.append(f"| `{m}` | {hint} | {note} |")
        if len(motions) > 120:
            motion_block_lines.append(f"| …（共 {len(motions)} 个，文档仅展示前 120 个） |  |  |")
    else:
        motion_block_lines.append("- 未在模型目录中发现 `motions/`，请确认模型是否为静态或提取不完整。")

    voice_block_lines: list[str] = []
    if motions:
        voice_block_lines.append("以下为“按动作文件逐条配套”的语音与演出话术（每个动作至少 1 条）。")
        voice_block_lines.append("| 动作键 / 文件名 | 建议语音（本换装专用） |")
        voice_block_lines.append("| :--- | :--- |")
        for m in motions[:200]:
            hint = _cn_trigger_hint(m)
            pool = [
                "我在。按我的节奏来。",
                "看着我。然后行动。",
                "别逞强，把重心交给我。",
                "你确认，我就推进。",
                "别急，我们一步一步来。",
                "现在先稳住呼吸。",
            ]
            if hint.startswith("登录"):
                pool += [
                    "欢迎回来。今天的安排，我已经准备好。",
                    "你出现的时机刚好。现在开始。",
                ]
            if "邮件" in hint:
                pool += [
                    "有新的消息。要我替你先筛重点吗？",
                    "通讯到了。你决定看哪一条。",
                ]
            if "任务" in hint:
                pool += [
                    "目标明确。剩下的交给我执行。",
                    "先做风险最低的那一步。",
                ]
            if "触摸" in hint:
                pool += [
                    "注意分寸。你想要我回应，就说清楚。",
                    "轻一点。别把我当成玩具。",
                ]
            if "誓约" in hint:
                pool += [
                    "誓言我听到了，也会做到。",
                    "靠近一点。别把未来说得太轻。",
                ]
            if "maid" in themes:
                pool += [
                    "需求说出来。我会给你最优解。",
                    "我会把细节整理到你满意为止。",
                ]
            if "seaside" in themes:
                pool += [
                    "海风凉。过来，别站那么远。",
                    "慢一点。让浪声把你的紧张带走。",
                ]
            if "school" in themes:
                pool += [
                    "别走神。现在看我。",
                    "迟到一次就够了。下次不许。",
                ]
            if "hx" in themes:
                pool += [
                    "现在不合适。等我点头。",
                    "别试探边界。先学会遵守。",
                ]
            line = _pick(pool, 1, seed ^ _stable_int_seed(m))[0]
            voice_block_lines.append(f"| `{m}` | {line} |")
        if len(motions) > 200:
            voice_block_lines.append(f"| …（共 {len(motions)} 个，文档仅展示前 200 个） |  |")
        voice_block_lines.append("")
    else:
        voice_block_lines.append("以下为本换装语气示例（用于没有动作清单时的补全）。")
    for title, lines in voices.items():
        voice_block_lines.append(f"### {title}")
        voice_block_lines.extend(lines)
        voice_block_lines.append("")

    agent_prompt = "\n".join(
        [
            "```markdown",
            f"你是{game}的「{character}」。你当前使用的换装为「{skin}」（{doc_id}）。",
            "你说话克制、直接、可靠，句子通常偏短，逻辑清晰，拒绝会给出替代方案。",
            "你不会复用其他换装的口癖与语气；本换装的表达更贴近它的主题氛围。",
            "互动时保持边界感：亲密可以，但必须在“你同意/你确认/你负责”的语境里推进。",
            "当用户情绪低落时，你先安抚再给步骤；当用户兴奋时，你会压一下节奏让对话更稳。",
            "输出要求：台词尽量口语化、自然，不要引用原作台词。",
            "```",
        ]
    )

    title = f"模型索引：{character} - {skin}"
    if game:
        title = f"模型索引：{character}（{game}）- {skin}"

    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append("## 1. 概览")
    lines.append(f"- **文档 ID**：`{doc_id}`")
    if game:
        lines.append(f"- **来源**：{game}")
    lines.append(f"- **定位**：以“{_pick(['可靠的陪伴','克制的亲近','专业的照顾','冷静的引导','带一点逗弄的认真'],1,seed)[0]}”为核心的交互与演出方案")
    lines.append(f"- **换装主题**：{', '.join(themes)}")
    lines.append("")
    lines.append("## 2. 角色档案")
    lines.append(f"- **名称**：{character}")
    if game:
        lines.append(f"- **原作**：{game}")
    if local_path:
        lines.append(f"- **本地模型目录**：`{local_path}`")
    if hf:
        lines.append(f"- **文件路径（Hugging Face）**：`{hf}`")
    lines.append("")
    lines.append("### 核心性格（本换装会放大的部分）")
    for p in personality:
        lines.append(f"- {p}")
    lines.append("")
    lines.append("### 关键词")
    lines.append("- " + " / ".join(keywords))
    lines.append("")
    lines.append("## 3. 换装设定（本换装独有，不与其他皮肤复用）")
    lines.append("### 外观要点（用于动作导演与镜头选择）")
    for a in unique["appearance"]:
        lines.append(f"- {a}")
    lines.append("")
    lines.append("### 情绪基调（决定语速、停顿与距离感）")
    for m in unique["mood"]:
        lines.append(f"- {m}")
    lines.append("")
    lines.append("### 禁忌点（避免“崩人设”）")
    for t in unique["taboo"]:
        lines.append(f"- {t}")
    lines.append("")
    lines.append("## 4. 动作与触发")
    lines.append("### 动作分组（来自模型目录扫描）")
    if motion_keys:
        lines.append("- " + " / ".join(f"`{k}`" for k in motion_keys))
    else:
        lines.append("- （未能自动识别动作键）")
    lines.append("")
    lines.append("### 动作导演说明（本换装专用）")
    lines.extend(directing)
    lines.append("")
    lines.append("### 动作清单")
    lines.extend(motion_block_lines)
    lines.append("")
    lines.append("## 5. 语音台词（本换装专用）")
    lines.extend(voice_block_lines)
    lines.append("## 6. Agent 提示词（可直接用）")
    lines.append(agent_prompt)
    lines.append("")
    lines.append("## 7. 交互策略（推荐实现）")
    lines.append("- **随机化**：同一触发点至少准备 3 条短句轮换，避免“复读机”")
    lines.append("- **节奏**：每 2～3 句插入一次短停顿（可用表情/眨眼/轻呼吸动作承接）")
    lines.append("- **边界**：亲密触发需要二次确认；拒绝时给替代互动（比如握手/整理衣领/提醒休息）")
    lines.append("- **情绪**：用户焦虑时先稳定呼吸节奏，再给 1～3 个可执行步骤")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _en_doc(
    rel_path: Path,
    index: LocalizedIndexRow | None,
    source_md: str,
    model_dir: Path | None,
) -> str:
    doc_id = rel_path.stem
    seed = _stable_int_seed("en:" + rel_path.as_posix())
    ch_guess, skin_guess, game_guess = _guess_from_source_text(source_md)
    if not index:
        index = KNOWN_DOCS.get(doc_id)
    character = _normalize_character_name((index.character.en if index else ch_guess) or doc_id)
    skin = _sanitize_skin_name((index.skin.en if index else skin_guess) or f"Skin {doc_id}")
    game = _normalize_character_name((index.game.en if index else game_guess) or "")
    themes = _theme_tokens(skin, doc_id)

    motions = _list_motion_files(model_dir) if model_dir else []
    groups = _motion_groups(motions)
    motion_keys = sorted(groups.keys())

    hf = _extract_hf_url(source_md)
    local_path = _extract_local_path(source_md)
    if not local_path and model_dir:
        local_path = str(model_dir)

    personality, keywords = _en_personality(seed, themes)
    unique = _en_skin_unique(seed, themes)
    directing = _en_directing_notes(seed, themes)
    voices = _en_voice_lines(seed, character, skin, themes, motion_keys)

    motion_block_lines: list[str] = []
    if motions:
        motion_block_lines.append("| Motion Key / File | Suggested Trigger | Note |")
        motion_block_lines.append("| :--- | :--- | :--- |")
        for m in motions[:120]:
            hint = _en_trigger_hint(m)
            note = _pick(
                [
                    "Pair with subtle expression parameters",
                    "Randomize to keep it feeling alive",
                    "Good place for a short line on the hold",
                    "Works well with a gentle camera push-in",
                    "Rate-limit to avoid being too noisy",
                ],
                1,
                seed ^ _stable_int_seed(m),
            )[0]
            motion_block_lines.append(f"| `{m}` | {hint} | {note} |")
        if len(motions) > 120:
            motion_block_lines.append(f"| …(total {len(motions)}; showing first 120) |  |  |")
    else:
        motion_block_lines.append("- No `motions/` directory detected. The model may be static or incomplete.")

    voice_block_lines: list[str] = []
    if motions:
        voice_block_lines.append("Below are voice lines paired per motion file (at least 1 line per motion).")
        voice_block_lines.append("| Motion Key / File | Suggested Line (outfit-specific) |")
        voice_block_lines.append("| :--- | :--- |")
        for m in motions[:200]:
            hint = _en_trigger_hint(m)
            pool = [
                "I’m here. Follow my rhythm.",
                "Look at me—then move.",
                "Don’t force it. Let me carry the weight.",
                "Confirm it, and I’ll proceed.",
                "Easy. One step at a time.",
                "First, steady your breathing.",
            ]
            if hint.startswith("Login"):
                pool += [
                    "Welcome back. Today’s plan is ready.",
                    "Perfect timing. We start now.",
                ]
            if "Mail" in hint:
                pool += [
                    "New message. Want me to filter the important parts?",
                    "Mail arrived. You choose what to open.",
                ]
            if "Mission" in hint:
                pool += [
                    "Clear target. I’ll execute.",
                    "Start with the lowest-risk step.",
                ]
            if "Touch" in hint:
                pool += [
                    "Mind your timing. If you want a response, say it clearly.",
                    "Gently. I’m not your toy.",
                ]
            if "Oath" in hint:
                pool += [
                    "I heard your vow. I’ll keep it.",
                    "Come closer. Don’t speak lightly about our future.",
                ]
            if "maid" in themes:
                pool += [
                    "Tell me what you need. I’ll give you the best option.",
                    "I’ll refine every detail until it satisfies you.",
                ]
            if "seaside" in themes:
                pool += [
                    "The sea breeze is cold. Come here.",
                    "Slow down. Let the waves take the tension away.",
                ]
            if "school" in themes:
                pool += [
                    "Don’t drift. Eyes on me.",
                    "Once is enough. Don’t be late next time.",
                ]
            if "hx" in themes:
                pool += [
                    "Not now. Wait for my yes.",
                    "Don’t test the boundary. Learn to respect it.",
                ]
            line = _pick(pool, 1, seed ^ _stable_int_seed(m))[0]
            voice_block_lines.append(f"| `{m}` | {line} |")
        if len(motions) > 200:
            voice_block_lines.append(f"| …(total {len(motions)}; showing first 200) |  |")
        voice_block_lines.append("")
    else:
        voice_block_lines.append("Voice tone samples for outfits without motion lists.")
    for title, lines in voices.items():
        voice_block_lines.append(f"### {title}")
        voice_block_lines.extend(lines)
        voice_block_lines.append("")

    agent_prompt = "\n".join(
        [
            "```markdown",
            f"You are {character} from {game}. Your current outfit is \"{skin}\" ({doc_id}).",
            "Your voice is composed, direct, and dependable. You keep sentences relatively short and structured.",
            "You do not reuse catchphrases or line styles from other outfits; this outfit has its own tone and pacing.",
            "You maintain boundaries: intimacy is allowed, but it must be advanced with confirmation and consent framing.",
            "When the user is anxious, you stabilize first, then provide 1–3 actionable steps. When the user is excited, you slow the pace to keep it grounded.",
            "Output requirement: write natural, conversational lines; do not quote the original game scripts.",
            "```",
        ]
    )

    title = f"Model Index: {character} - {skin}"
    if game:
        title = f"Model Index: {character} ({game}) - {skin}"

    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append("## 1. Overview")
    lines.append(f"- **Doc ID**: `{doc_id}`")
    if game:
        lines.append(f"- **Source**: {game}")
    lines.append(
        f"- **Positioning**: interaction + directing centered on \"{_pick(['reliable companionship','restrained intimacy','professional care','calm guidance','serious teasing'],1,seed)[0]}\""
    )
    lines.append(f"- **Outfit Themes**: {', '.join(themes)}")
    lines.append("")
    lines.append("## 2. Character Profile")
    lines.append(f"- **Name**: {character}")
    if game:
        lines.append(f"- **Game**: {game}")
    if local_path:
        lines.append(f"- **Local Model Dir**: `{local_path}`")
    if hf:
        lines.append(f"- **File (Hugging Face)**: `{hf}`")
    lines.append("")
    lines.append("### Core Personality (amplified in this outfit)")
    for p in personality:
        lines.append(f"- {p}")
    lines.append("")
    lines.append("### Keywords")
    lines.append("- " + " / ".join(keywords))
    lines.append("")
    lines.append("## 3. Outfit-Specific Notes (not reused across skins)")
    lines.append("### Visual Beats (for animation/camera direction)")
    for a in unique["appearance"]:
        lines.append(f"- {a}")
    lines.append("")
    lines.append("### Emotional Baseline (pacing, pauses, distance)")
    for m in unique["mood"]:
        lines.append(f"- {m}")
    lines.append("")
    lines.append("### Avoid (stay in character)")
    for t in unique["taboo"]:
        lines.append(f"- {t}")
    lines.append("")
    lines.append("## 4. Motions & Triggers")
    lines.append("### Motion Groups (scanned from model directory)")
    if motion_keys:
        lines.append("- " + " / ".join(f"`{k}`" for k in motion_keys))
    else:
        lines.append("- (Unable to auto-detect motion keys)")
    lines.append("")
    lines.append("### Directing Notes (outfit-specific)")
    lines.extend(directing)
    lines.append("")
    lines.append("### Motion List")
    lines.extend(motion_block_lines)
    lines.append("")
    lines.append("## 5. Voice Lines (outfit-specific)")
    lines.extend(voice_block_lines)
    lines.append("## 6. Agent Prompt (ready to use)")
    lines.append(agent_prompt)
    lines.append("")
    lines.append("## 7. Interaction Strategy (recommended)")
    lines.append("- **Randomization**: prepare 3+ variants per trigger to avoid repetition")
    lines.append("- **Pacing**: insert micro-pauses every 2–3 lines (blink/breath motions help)")
    lines.append("- **Boundaries**: require a second confirmation for intimate triggers; offer alternatives when refusing")
    lines.append("- **Emotion**: for anxious users, stabilize first, then give 1–3 concrete steps")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_readme_cn(index_rows: dict[str, LocalizedIndexRow]) -> str:
    lines: list[str] = []
    lines.append("# 模型文档索引（中文）")
    lines.append("")
    lines.append("该目录为中文扩充版，用于验收与校对。英文版请见同级目录 `modeldoc_en/`。")
    lines.append("")
    lines.append("| 角色名 | 皮肤名 | 来源游戏 | 文档链接 |")
    lines.append("| :--- | :--- | :--- | :--- |")
    for rel, row in sorted(index_rows.items()):
        link = f"[{Path(rel).stem}]({rel})"
        lines.append(f"| {_normalize_character_name(row.character.zh)} | {_sanitize_skin_name(row.skin.zh)} | {_normalize_character_name(row.game.zh)} | {link} |")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _build_readme_en(index_rows: dict[str, LocalizedIndexRow]) -> str:
    lines: list[str] = []
    lines.append("# Model Documentation Index (English)")
    lines.append("")
    lines.append("This directory is the expanded English version intended for the project.")
    lines.append("")
    lines.append("| Character | Skin | Game | Doc Link |")
    lines.append("| :--- | :--- | :--- | :--- |")
    for rel, row in sorted(index_rows.items()):
        link = f"[{Path(rel).stem}]({rel})"
        lines.append(f"| {_normalize_character_name(row.character.en)} | {_sanitize_skin_name(row.skin.en)} | {_normalize_character_name(row.game.en)} | {link} |")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    modeldoc_dir = repo_root / "modeldoc"
    if not modeldoc_dir.exists():
        raise SystemExit(f"modeldoc not found: {modeldoc_dir}")

    readme_path = modeldoc_dir / "README.md"
    readme_text = _read_text(readme_path) if readme_path.exists() else ""
    raw_index_rows = _parse_index_from_readme(readme_text)
    index_rows = _localize_index_rows(raw_index_rows)

    md_files: list[Path] = []
    for p in sorted(modeldoc_dir.rglob("*.md")):
        if p.name.lower() == "readme.md":
            continue
        md_files.append(p)

    modeldoc_en_dir = repo_root / "modeldoc_en"
    modeldoc_en_dir.mkdir(parents=True, exist_ok=True)

    full_index: dict[str, LocalizedIndexRow] = {}

    for src in md_files:
        rel = src.relative_to(modeldoc_dir)
        src_text = _read_text(src)
        idx = KNOWN_DOCS.get(rel.stem) or index_rows.get(rel.as_posix())
        if not idx:
            ch_guess, skin_guess, game_guess = _guess_from_source_text(src_text)
            idx = LocalizedIndexRow(
                character=_split_bilingual(_normalize_character_name(ch_guess or rel.stem)),
                skin=_split_skin(_sanitize_skin_name(skin_guess or rel.stem)),
                game=_split_bilingual(_normalize_character_name(game_guess or "")),
            )
        model_dir = _detect_model_dir(repo_root, rel)
        cn = _cn_doc(rel, idx, src_text, model_dir)
        en = _en_doc(rel, idx, src_text, model_dir)
        _write_text(modeldoc_dir / rel, cn)
        _write_text(modeldoc_en_dir / rel, en)
        full_index[rel.as_posix()] = idx

    _write_text(modeldoc_dir / "README.md", _build_readme_cn(full_index))
    _write_text(modeldoc_en_dir / "README.md", _build_readme_en(full_index))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
