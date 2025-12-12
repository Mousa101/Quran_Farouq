import os
import json
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

async def analyze_tracking_sheet(image_base64: str) -> dict:
    """
    Analyze tracking sheet image using Gemini 2.5 Flash
    Returns extracted data: prayers count, quran sitting time, family recitation
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            logger.error("EMERGENT_LLM_KEY not found")
            return {
                "prayers_count": 0,
                "quran_sitting_minutes": 0,
                "family_recitation_count": 0,
                "notes": "خطأ: مفتاح API غير موجود"
            }
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"tracking-sheet-{os.urandom(4).hex()}",
            system_message="""أنت مساعد متخصص في قراءة وتحليل أوراق متابعة حفظ القرآن الكريم.
            مهمتك هي استخراج البيانات التالية من الصورة:
            1. عدد الصلوات المؤداة (prayers_count)
            2. وقت الجلوس مع القرآن بالدقائق (quran_sitting_minutes)
            3. عدد مرات التسميع للأهل (family_recitation_count)
            
            أرجع البيانات بصيغة JSON فقط بدون أي نص إضافي.
            مثال: {"prayers_count": 35, "quran_sitting_minutes": 120, "family_recitation_count": 5, "notes": "ملاحظات إضافية"}
            
            إذا لم تتمكن من قراءة قيمة معينة، ضع 0 كقيمة افتراضية."""
        ).with_model("gemini", "gemini-2.5-flash")
        
        image_content = ImageContent(image_base64=image_base64)
        
        user_message = UserMessage(
            text="قم بتحليل ورقة المتابعة هذه واستخرج البيانات المطلوبة. أرجع النتيجة بصيغة JSON فقط.",
            image_contents=[image_content]
        )
        
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        try:
            # Clean the response if it contains markdown code blocks
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            clean_response = clean_response.strip()
            
            data = json.loads(clean_response)
            return {
                "prayers_count": int(data.get("prayers_count", 0)),
                "quran_sitting_minutes": int(data.get("quran_sitting_minutes", 0)),
                "family_recitation_count": int(data.get("family_recitation_count", 0)),
                "notes": data.get("notes", "")
            }
        except json.JSONDecodeError:
            logger.error(f"Failed to parse JSON response: {response}")
            return {
                "prayers_count": 0,
                "quran_sitting_minutes": 0,
                "family_recitation_count": 0,
                "notes": f"تم تحليل الصورة: {response[:200]}"
            }
            
    except ImportError:
        logger.error("emergentintegrations not installed")
        return {
            "prayers_count": 0,
            "quran_sitting_minutes": 0,
            "family_recitation_count": 0,
            "notes": "مكتبة التحليل غير مثبتة"
        }
    except Exception as e:
        logger.error(f"Error analyzing image: {str(e)}")
        return {
            "prayers_count": 0,
            "quran_sitting_minutes": 0,
            "family_recitation_count": 0,
            "notes": f"خطأ في التحليل: {str(e)}"
        }
