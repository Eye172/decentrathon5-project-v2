"""
Translation service for translating AI responses to user's preferred language.
Uses Google Translate via deep-translator library (free, no API key required).
"""
from deep_translator import GoogleTranslator
from typing import Optional


# Map frontend language codes to Google Translate language codes
LANGUAGE_MAP = {
    "ru": "ru",  # Russian
    "en": "en",  # English
    "kz": "kk",  # Kazakh (Google uses 'kk' for Kazakh)
}


def translate_text(text: str, target_lang: str) -> str:
    """
    Translate text to the target language.
    
    Args:
        text: Text to translate (assumed to be in English from AI)
        target_lang: Target language code ('ru', 'en', 'kz')
    
    Returns:
        Translated text, or original text if translation fails or target is English
    """
    # If target is English or invalid, return original
    if not target_lang or target_lang == "en":
        return text
    
    # Map frontend language code to Google Translate code
    google_lang_code = LANGUAGE_MAP.get(target_lang)
    if not google_lang_code:
        return text
    
    try:
        # Translate from English to target language
        translated = GoogleTranslator(source='en', target=google_lang_code).translate(text)
        return translated if translated else text
    except Exception as e:
        # If translation fails, return original text
        print(f"Translation error: {e}")
        return text


def should_translate(lang: Optional[str]) -> bool:
    """Check if translation is needed for the given language."""
    return lang is not None and lang != "en" and lang in LANGUAGE_MAP
