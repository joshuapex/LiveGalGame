from typing import Optional, Set

from funasr import AutoModel


def apply_punctuation(text: str, model: AutoModel) -> str:
    """使用标点模型对文本进行标点化。"""
    if not text or not text.strip():
        return text

    try:
        response = model.generate(input=text.strip())
        if response and isinstance(response, list) and len(response) > 0:
            if isinstance(response[0], dict):
                punctuated_text = response[0].get("text", "") or response[0].get("value", "")
                return punctuated_text.strip() if punctuated_text else text
            else:
                return str(response[0]).strip()
        elif isinstance(response, dict):
            punctuated_text = response.get("text", "") or response.get("value", "")
            return punctuated_text.strip() if punctuated_text else text
        return text
    except Exception as exc:
        # 保守返回原始文本，避免中断主流程
        return text


def apply_incremental_punctuation(
    stable_text: str,
    new_raw_text: str,
    punc_model: AutoModel,
    sentence_end_punctuation: Set[str],
    context_sentences: int = 1,
) -> str:
    """
    增量标点化：仅对新文本添加标点，保留上下文提升准确性。
    """
    if not new_raw_text or not new_raw_text.strip():
        return ""

    # 从 stable_text 中提取上下文（最后 N 个句子）
    context = ""
    if stable_text and context_sentences > 0:
        sentence_ends = [i + 1 for i, ch in enumerate(stable_text) if ch in sentence_end_punctuation]
        if sentence_ends:
            start_pos = sentence_ends[-context_sentences] if len(sentence_ends) >= context_sentences else 0
            context = stable_text[start_pos:]

    # 组合上下文 + 新文本进行标点化
    text_to_punctuate = f"{context}{new_raw_text}"
    punctuated_full = apply_punctuation(text_to_punctuate, punc_model)

    if context:
        context_len = len(context)
        if len(punctuated_full) > context_len:
            return punctuated_full[context_len:]
        return new_raw_text

    return punctuated_full


