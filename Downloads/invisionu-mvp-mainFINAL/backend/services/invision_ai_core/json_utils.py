import json
import re


def strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.lstrip().startswith("json"):
                text = re.sub(r"^json\s*", "", text.lstrip(), flags=re.IGNORECASE)
    return text.strip()


def parse_json_object(raw: str) -> dict:
    text = strip_code_fence(raw)
    return json.loads(text)
