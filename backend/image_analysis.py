import os
import json
import logging
import base64
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

async def analyze_tracking_sheet(image_base64: str) -> dict:
    """
    تحليل صورة ورقة المتابعة باستخدام Gemini 2.5 Flash
    يقوم بعدّ علامات الصح ✓ في كل خانة
    """
    try:
        from emergentintegrations.llm.chat import LlmChat
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            logger.error("EMERGENT_LLM_KEY not found")
            return get_default_response("مفتاح API غير موجود - يرجى استخدام الإدخال اليدوي")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"tracking-sheet-{os.urandom(4).hex()}",
            system_message="""أنت مساعد متخصص في قراءة وتحليل أوراق متابعة حفظ القرآن الكريم.

مهمتك هي عدّ علامات الصح (✓ أو ✔ أو √) الموجودة في الصورة لكل فئة من الفئات التالية:

1. الصلوات (prayers_count): عدد علامات الصح في خانة الصلوات - الحد الأقصى 35 (5 صلوات × 7 أيام)
2. الجلوس مع القرآن (quran_sitting_days): عدد علامات الصح - الحد الأقصى 7
3. صلاة الضحى (duha_prayers): عدد علامات الصح - الحد الأقصى 7
4. التسميع للأهل (family_recitation): عدد علامات الصح - الحد الأقصى 7
5. ساعات الدراسة (study_hours): عدد علامات الصح - الحد الأقصى 7
6. الوتر (witr_prayers_days): عدد علامات الصح - الحد الأقصى 7
7. قيام الليل (night_prayer): عدد علامات الصح - الحد الأقصى 1
8. الصيام (fasting): عدد علامات الصح - الحد الأقصى 1

قم بعدّ كل علامة صح تراها في الصورة لكل فئة.

أرجع البيانات بصيغة JSON فقط بدون أي نص إضافي.
مثال: 
{
  "prayers_count": 28,
  "quran_sitting_days": 5,
  "duha_prayers": 4,
  "family_recitation": 6,
  "study_hours": 5,
  "witr_prayers_days": 7,
  "night_prayer": 1,
  "fasting": 0
}

إذا لم تتمكن من قراءة قيمة معينة أو لم تجد علامات صح، ضع 0 كقيمة افتراضية."""
        ).with_model("gemini", "gemini-2.5-flash")
        
        # Create message with image
        prompt = """قم بتحليل هذه الصورة لورقة المتابعة الإيمانية.
        
اعدّ جميع علامات الصح (✓) الموجودة في كل فئة:
- الصلوات (35 خانة كحد أقصى)
- الجلوس مع القرآن (7 خانات)
- صلاة الضحى (7 خانات)
- التسميع للأهل (7 خانات)
- ساعات الدراسة (7 خانات)
- الوتر (7 خانات)
- قيام الليل (خانة واحدة)
- الصيام (خانة واحدة)

أرجع النتيجة بصيغة JSON فقط."""

        # Use send_message_with_image for proper image analysis
        response = await chat.send_message_with_image(
            message=prompt,
            image_base64=image_base64
        )
        
        # Parse JSON response
        try:
            clean_response = response.strip()
            # Remove markdown code blocks if present
            if "```" in clean_response:
                parts = clean_response.split("```")
                for part in parts:
                    if part.strip().startswith("json"):
                        clean_response = part.strip()[4:].strip()
                        break
                    elif part.strip().startswith("{"):
                        clean_response = part.strip()
                        break
            
            # Find JSON object
            start_idx = clean_response.find("{")
            end_idx = clean_response.rfind("}") + 1
            if start_idx != -1 and end_idx > start_idx:
                clean_response = clean_response[start_idx:end_idx]
            
            data = json.loads(clean_response)
            
            result = {
                "prayers_count": min(int(data.get("prayers_count", 0)), 35),
                "quran_sitting_days": min(int(data.get("quran_sitting_days", 0)), 7),
                "duha_prayers": min(int(data.get("duha_prayers", 0)), 7),
                "family_recitation": min(int(data.get("family_recitation", 0)), 7),
                "study_hours": min(int(data.get("study_hours", 0)), 7),
                "witr_prayers_days": min(int(data.get("witr_prayers_days", 0)), 7),
                "night_prayer": min(int(data.get("night_prayer", 0)), 1),
                "fasting": min(int(data.get("fasting", 0)), 1)
            }
            
            logger.info(f"تم تحليل ورقة المتابعة بنجاح: {result}")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"فشل في تحليل JSON: {response[:200]}... Error: {e}")
            return get_default_response("تعذر تحليل الصورة - يرجى استخدام الإدخال اليدوي")
            
    except ImportError:
        logger.error("emergentintegrations not installed")
        return get_default_response("مكتبة التحليل غير مثبتة - يرجى استخدام الإدخال اليدوي")
    except Exception as e:
        logger.error(f"خطأ في تحليل الصورة: {str(e)}")
        return get_default_response(f"خطأ في التحليل: {str(e)[:50]} - يرجى استخدام الإدخال اليدوي")


def get_default_response(notes: str = "") -> dict:
    """إرجاع استجابة فارغة افتراضية"""
    return {
        "prayers_count": 0,
        "quran_sitting_days": 0,
        "duha_prayers": 0,
        "family_recitation": 0,
        "study_hours": 0,
        "witr_prayers_days": 0,
        "night_prayer": 0,
        "fasting": 0,
        "notes": notes
    }
