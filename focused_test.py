#!/usr/bin/env python3
"""
Focused test for new features in Quran Memorization App
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://student-points-reset.preview.emergentagent.com/api"

def make_request(method, endpoint, data=None, token=None, expected_status=200):
    """Make HTTP request with proper headers"""
    url = f"{BASE_URL}/{endpoint}"
    headers = {'Content-Type': 'application/json'}
    
    if token:
        headers['Authorization'] = f'Bearer {token}'

    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=30)
        elif method == 'POST':
            response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method == 'PUT':
            response = requests.put(url, json=data, headers=headers, timeout=30)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=30)

        success = response.status_code == expected_status
        return success, response.json() if response.content else {}, response.status_code

    except Exception as e:
        return False, {"error": str(e)}, 0

def test_new_features():
    """Test the new features mentioned in the review request"""
    print("🚀 Testing New Features for Quran Memorization App")
    print("=" * 60)
    
    # Step 1: Login as admin
    print("\n1. 🔑 Admin Login...")
    success, response, status = make_request('POST', 'auth/login', {
        "email": "test_admin@test.com",
        "password": "test123"
    })
    
    if not success:
        print(f"❌ Admin login failed: {status} - {response}")
        return False
        
    admin_token = response['token']
    admin_user = response['user']
    print(f"✅ Admin logged in: {admin_user['name']}")
    
    # Step 2: Reset passwords for sheikh and student
    print("\n2. 🔐 Testing Admin Password Reset...")
    
    # Reset student password
    success, response, status = make_request('POST', 'admin/reset-password', {
        "email": "test_student@test.com",
        "new_password": "newpass123"
    }, admin_token)
    
    if success:
        print("✅ Student password reset successful")
    else:
        print(f"❌ Student password reset failed: {status} - {response}")
    
    # Reset sheikh password
    success, response, status = make_request('POST', 'admin/reset-password', {
        "email": "test_sheikh@test.com", 
        "new_password": "newpass123"
    }, admin_token)
    
    if success:
        print("✅ Sheikh password reset successful")
    else:
        print(f"❌ Sheikh password reset failed: {status} - {response}")
    
    # Test unauthorized access
    success, response, status = make_request('POST', 'admin/reset-password', {
        "email": "test_student@test.com",
        "new_password": "hackpass"
    }, None, expected_status=401)
    
    if success:
        print("✅ Unauthorized password reset properly blocked (no token)")
    else:
        print(f"❌ Unauthorized access not properly blocked: {status}")
    
    # Step 3: Login as student with new password
    print("\n3. 👨‍🎓 Student Login...")
    success, response, status = make_request('POST', 'auth/login', {
        "email": "test_student@test.com",
        "password": "newpass123"
    })
    
    if not success:
        print(f"❌ Student login failed: {status} - {response}")
        return False
        
    student_token = response['token']
    student_user = response['user']
    print(f"✅ Student logged in: {student_user['name']}")
        
    # Test non-admin trying to reset password
    success, response, status = make_request('POST', 'admin/reset-password', {
        "email": "test_student@test.com",
        "new_password": "hackpass"
    }, student_token, expected_status=403)
    
    if success:
        print("✅ Non-admin password reset properly blocked")
    else:
        print(f"❌ Non-admin access not properly blocked: {status}")
    
    # Step 4: Login as sheikh with new password
    print("\n4. 👨‍🏫 Sheikh Login...")
    success, response, status = make_request('POST', 'auth/login', {
        "email": "test_sheikh@test.com",
        "password": "newpass123"
    })
    
    if not success:
        print(f"❌ Sheikh login failed: {status} - {response}")
        return False
        
    sheikh_token = response['token']
    sheikh_user = response['user']
    print(f"✅ Sheikh logged in: {sheikh_user['name']}")
    
    # Step 5: Test Student Tracking Sheet Entry
    print("\n5. 📋 Testing Student Tracking Sheet Entry...")
    
    # Get current week start (Sunday)
    today = datetime.now()
    days_since_sunday = today.weekday() + 1 if today.weekday() != 6 else 0
    week_start = (today - timedelta(days=days_since_sunday)).strftime('%Y-%m-%d')
    
    tracking_data = {
        "week_start": week_start,
        "prayers_count": 30,
        "quran_sitting_days": 6,
        "duha_prayers": 5,
        "family_recitation": 4,
        "study_hours": 6,
        "witr_prayers_days": 7,
        "night_prayer": 1,
        "fasting": 0,
        "notes": "أسبوع جيد في العبادة والحفظ"
    }
    
    success, response, status = make_request('POST', 'tracking-sheets/student', tracking_data, student_token)
    
    if success:
        print("✅ Student tracking sheet created successfully")
        print(f"   Points earned: {response.get('points_earned', 'N/A')}")
        
        # Test updating the same week (should update existing)
        updated_data = {**tracking_data, "prayers_count": 35, "notes": "تحديث: أسبوع ممتاز"}
        success, response, status = make_request('POST', 'tracking-sheets/student', updated_data, student_token)
        
        if success:
            print("✅ Student tracking sheet updated successfully")
        else:
            print(f"❌ Student tracking sheet update failed: {status} - {response}")
    else:
        print(f"❌ Student tracking sheet creation failed: {status} - {response}")
    
    # Test unauthorized access (sheikh trying to use student endpoint)
    success, response, status = make_request('POST', 'tracking-sheets/student', tracking_data, sheikh_token, expected_status=403)
    
    if success:
        print("✅ Unauthorized tracking sheet access properly blocked")
    else:
        print(f"❌ Unauthorized access not properly blocked: {status}")
    
    # Step 6: Test Student Profile APIs
    print("\n6. 👤 Testing Student Profile APIs...")
    
    student_id = student_user['id']
    
    # Test GET /api/students/{student_id}/profile
    success, response, status = make_request('GET', f'students/{student_id}/profile', token=admin_token)
    
    if success and 'student' in response:
        print("✅ Admin can access student profile")
    else:
        print(f"❌ Admin student profile access failed: {status} - {response}")
    
    # Test student accessing their own profile
    success, response, status = make_request('GET', f'students/{student_id}/profile', token=student_token)
    
    if success and 'student' in response:
        print("✅ Student can access own profile")
    else:
        print(f"❌ Student own profile access failed: {status} - {response}")
    
    # Test GET /api/students/{student_id}/progress
    success, response, status = make_request('GET', f'students/{student_id}/progress', token=admin_token)
    
    if success and 'total_progress' in response:
        print("✅ Admin can access student progress")
    else:
        print(f"❌ Admin student progress access failed: {status} - {response}")
    
    # Test unauthorized access (should fail)
    success, response, status = make_request('GET', f'students/{student_id}/profile', token=sheikh_token, expected_status=403)
    
    if success:
        print("✅ Unauthorized profile access properly blocked")
    else:
        print(f"ℹ️  Sheikh can access student profile (might be allowed): {status}")
    
    # Step 7: Test GET Tracking Sheets
    print("\n7. 📋 Testing GET Tracking Sheets...")
    
    # Test as student
    success, response, status = make_request('GET', 'tracking-sheets', token=student_token)
    
    if success and isinstance(response, list):
        print(f"✅ Student can get tracking sheets (found {len(response)} sheets)")
    else:
        print(f"❌ Student tracking sheets access failed: {status} - {response}")
    
    # Test as admin
    success, response, status = make_request('GET', 'tracking-sheets', token=admin_token)
    
    if success and isinstance(response, list):
        print(f"✅ Admin can get tracking sheets (found {len(response)} sheets)")
    else:
        print(f"❌ Admin tracking sheets access failed: {status} - {response}")
    
    # Step 8: Test Student Self Update
    print("\n8. ✏️ Testing Student Self Update...")
    
    # Test GET /api/students/me/profile (this endpoint might not exist, let's check)
    success, response, status = make_request('GET', 'students/me/profile', token=student_token)
    
    if success:
        print("✅ Student can get own profile via /me endpoint")
    else:
        print(f"ℹ️  /students/me/profile endpoint not available: {status}")
    
    # Test PUT /api/students/me/profile (this endpoint might not exist, let's check)
    update_data = {
        "student_phone": "0501234567",
        "school_name": "مدرسة الفاروق الابتدائية",
        "school_grade": "الصف السادس",
        "school_average": "95%"
    }
    
    success, response, status = make_request('PUT', 'students/me/profile', update_data, student_token)
    
    if success:
        print("✅ Student can update own profile via /me endpoint")
    else:
        print(f"ℹ️  /students/me/profile update endpoint not available: {status}")
        
        # Try the general user profile update endpoint
        success, response, status = make_request('PUT', 'users/me', update_data, student_token)
        
        if success:
            print("✅ Student can update profile via /users/me endpoint")
        else:
            print(f"❌ Student profile update failed: {status} - {response}")
    
    # Step 9: Test Attendance with Excuse
    print("\n9. 📅 Testing Attendance with Excuse...")
    
    attendance_data = {
        "student_id": student_id,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "status": "excused",
        "excuse_reason": "مريض - حمى شديدة"
    }
    
    success, response, status = make_request('POST', 'attendance', attendance_data, sheikh_token)
    
    if success:
        print("✅ Sheikh can mark attendance with excuse")
    else:
        print(f"❌ Attendance with excuse failed: {status} - {response}")
    
    # Test regular attendance without excuse
    attendance_regular = {
        "student_id": student_id,
        "date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
        "status": "present"
    }
    
    success, response, status = make_request('POST', 'attendance', attendance_regular, sheikh_token)
    
    if success:
        print("✅ Sheikh can mark regular attendance")
    else:
        print(f"❌ Regular attendance failed: {status} - {response}")
    
    print("\n" + "=" * 60)
    print("🎉 New Features Testing Complete!")
    return True

if __name__ == "__main__":
    test_new_features()