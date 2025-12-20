import os
import json
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

async def analyze_tracking_sheet(image_base64: str) -> dict:
    """
    Analyze tracking sheet image using Gemini 2.5 Flash
    Returns extracted data for tracking sheet
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
            مهمتك هي استخراج البيانات التالية من الصورة:
            1. عدد الصلوات المؤداة خلال الأسبوع (prayers_count) - الحد الأقصى 35
            2. عدد أيام الأذكار بعد الصلاة (adhkar_count) - الحد الأقصى 7
            3. عدد أيام الجلوس مع القرآن (quran_sitting_days) - الحد الأقصى 7
            4. عدد أيام صلاة السنن الرواتب (sunnah_prayers_days) - الحد الأقصى 7
            5. عدد أيام صلاة الوتر (witr_prayers_days) - الحد الأقصى 7
            
            أرجع البيانات بصيغة JSON فقط بدون أي نص إضافي.
            مثال: {"prayers_count": 30, "adhkar_count": 5, "quran_sitting_days": 6, "sunnah_prayers_days": 4, "witr_prayers_days": 7}
            
            إذا لم تتمكن من قراءة قيمة معينة، ضع 0 كقيمة افتراضية."""
        ).with_model("gemini", "gemini-2.5-flash")
        
        # Send image with text using the correct method
        prompt = f"""قم بتحليل ورقة المتابعة هذه واستخرج البيانات المطلوبة.
        
        الصورة (base64): {image_base64[:100]}...
        
        أرجع النتيجة بصيغة JSON فقط."""
        
        response = await chat.send_message(prompt)
        
        # Parse JSON response
        try:
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            clean_response = clean_response.strip()
            
            data = json.loads(clean_response)
            return {
                "prayers_count": min(int(data.get("prayers_count", 0)), 35),
                "adhkar_count": min(int(data.get("adhkar_count", 0)), 7),
                "quran_sitting_days": min(int(data.get("quran_sitting_days", 0)), 7),
                "sunnah_prayers_days": min(int(data.get("sunnah_prayers_days", 0)), 7),
                "witr_prayers_days": min(int(data.get("witr_prayers_days", 0)), 7),
                "quran_sitting_minutes": 0,
                "family_recitation_count": 0
            }
        except json.JSONDecodeError:
            logger.error(f"Failed to parse JSON response: {response}")
            return get_default_response("تعذر تحليل الصورة - يرجى استخدام الإدخال اليدوي")
            
    except ImportError:
        logger.error("emergentintegrations not installed")
        return get_default_response("مكتبة التحليل غير مثبتة - يرجى استخدام الإدخال اليدوي")
    except Exception as e:
        logger.error(f"Error analyzing image: {str(e)}")
        return get_default_response(f"خطأ في التحليل - يرجى استخدام الإدخال اليدوي")

def get_default_response(notes: str = "") -> dict:
    """Return default empty response"""
    return {
        "prayers_count": 0,
        "adhkar_count": 0,
        "quran_sitting_days": 0,
        "sunnah_prayers_days": 0,
        "witr_prayers_days": 0,
        "quran_sitting_minutes": 0,
        "family_recitation_count": 0,
        "notes": notes
    }
