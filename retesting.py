#!/usr/bin/env python3
"""
Additional tests for endpoints marked as needs_retesting in test_result.md
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "https://islamic-edu-system.preview.emergentagent.com/api"

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

def test_retesting_endpoints():
    """Test endpoints marked for retesting in test_result.md"""
    print("🔄 Testing Endpoints Marked for Retesting")
    print("=" * 50)
    
    # Login to get tokens
    print("\n🔑 Getting authentication tokens...")
    
    # Admin login
    success, response, status = make_request('POST', 'auth/login', {
        "email": "test_admin@test.com",
        "password": "test123"
    })
    admin_token = response['token'] if success else None
    
    # Student login  
    success, response, status = make_request('POST', 'auth/login', {
        "email": "test_student@test.com",
        "password": "newpass123"
    })
    student_token = response['token'] if success else None
    student_id = response['user']['id'] if success else None
    
    # Sheikh login
    success, response, status = make_request('POST', 'auth/login', {
        "email": "test_sheikh@test.com",
        "password": "newpass123"
    })
    sheikh_token = response['token'] if success else None
    sheikh_id = response['user']['id'] if success else None
    
    if not all([admin_token, student_token, sheikh_token]):
        print("❌ Failed to get all required tokens")
        return False
    
    print("✅ All tokens obtained successfully")
    
    # Test 1: Student Self Update API (needs_retesting: true)
    print("\n1. 📝 Testing Student Self Update API...")
    
    # Test GET /api/users/me/full
    success, response, status = make_request('GET', 'users/me/full', token=student_token)
    if success:
        print("✅ GET /users/me/full works")
    else:
        print(f"❌ GET /users/me/full failed: {status} - {response}")
    
    # Test PUT /api/users/me
    update_data = {
        "student_phone": "0501234567",
        "school_name": "مدرسة الفاروق الابتدائية", 
        "school_grade": "الصف السادس",
        "school_average": "95%"
    }
    
    success, response, status = make_request('PUT', 'users/me', update_data, token=student_token)
    if success:
        print("✅ PUT /users/me works")
    else:
        print(f"❌ PUT /users/me failed: {status} - {response}")
    
    # Test 2: Attendance with Excuse Reason API (needs_retesting: true)
    print("\n2. 📅 Testing Attendance with Excuse Reason...")
    
    attendance_data = {
        "student_id": student_id,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "status": "excused",
        "excuse_reason": "مريض - حمى شديدة"
    }
    
    success, response, status = make_request('POST', 'attendance', attendance_data, token=sheikh_token)
    if success:
        print("✅ POST /attendance with excuse_reason works")
    else:
        print(f"❌ POST /attendance with excuse failed: {status} - {response}")
    
    # Test 3: Curriculum Management API (needs_retesting: true)
    print("\n3. 📚 Testing Curriculum Management API...")
    
    # Test POST /api/curriculum
    curriculum_data = {
        "name": "منهج حفظ القرآن الكريم",
        "description": "منهج شامل لحفظ القرآن الكريم",
        "type": "manual"
    }
    
    success, response, status = make_request('POST', 'curriculum', curriculum_data, token=admin_token)
    if success:
        print("✅ POST /curriculum works")
        curriculum_id = response.get('curriculum_id')
    else:
        print(f"❌ POST /curriculum failed: {status} - {response}")
        curriculum_id = None
    
    # Test GET /api/curriculum
    success, response, status = make_request('GET', 'curriculum', token=admin_token)
    if success and isinstance(response, list):
        print(f"✅ GET /curriculum works (found {len(response)} curricula)")
    else:
        print(f"❌ GET /curriculum failed: {status} - {response}")
    
    # Test 4: Schedule Management API (needs_retesting: true)
    print("\n4. 📅 Testing Schedule Management API...")
    
    # Test POST /api/schedule
    schedule_data = {
        "name": "جدول الحصص الأسبوعي",
        "description": "جدول حصص حفظ القرآن",
        "start_date": "2025-01-01"
    }
    
    success, response, status = make_request('POST', 'schedule', schedule_data, token=admin_token)
    if success:
        print("✅ POST /schedule works")
        schedule_id = response.get('schedule_id')
    else:
        print(f"❌ POST /schedule failed: {status} - {response}")
        schedule_id = None
    
    # Test GET /api/schedule
    success, response, status = make_request('GET', 'schedule', token=admin_token)
    if success and isinstance(response, list):
        print(f"✅ GET /schedule works (found {len(response)} schedules)")
    else:
        print(f"❌ GET /schedule failed: {status} - {response}")
    
    # Test 5: Sheikh Rankings API (needs_retesting: true)
    print("\n5. 🏆 Testing Sheikh Rankings API...")
    
    success, response, status = make_request('GET', 'rankings/sheikh-students', token=sheikh_token)
    if success:
        print("✅ GET /rankings/sheikh-students works")
    else:
        print(f"❌ GET /rankings/sheikh-students failed: {status} - {response}")
    
    # Test 6: Admin Rankings API with Filters (needs_retesting: true)
    print("\n6. 🏆 Testing Admin Rankings API with Filters...")
    
    filters = ['groups', 'students', 'attendance', 'recitations']
    for filter_type in filters:
        success, response, status = make_request('GET', f'rankings/admin?filter_type={filter_type}', token=admin_token)
        if success:
            print(f"✅ GET /rankings/admin?filter_type={filter_type} works")
        else:
            print(f"❌ GET /rankings/admin?filter_type={filter_type} failed: {status} - {response}")
    
    print("\n" + "=" * 50)
    print("🎉 Retesting Complete!")
    return True

if __name__ == "__main__":
    test_retesting_endpoints()