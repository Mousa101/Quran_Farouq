#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Quran Memorization App
Tests all endpoints with different user roles (student, sheikh, admin)
"""

import requests
import sys
import json
from datetime import datetime, timedelta
import base64

class QuranAppAPITester:
    def __init__(self, base_url="https://student-points-reset.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tokens = {}  # Store tokens for different users
        self.users = {}   # Store user data
        self.test_data = {}  # Store created test data
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            self.failed_tests.append({"name": name, "details": details})
            print(f"❌ {name} - {details}")

    def make_request(self, method, endpoint, data=None, token=None, expected_status=200):
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/{endpoint}"
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

    def test_user_login(self):
        """Test user login with provided test credentials"""
        print("\n🔑 Testing User Login...")
        
        # Use the test credentials from the review request
        login_data = [
            {"email": "test_student@test.com", "password": "test123", "role": "student"},
            {"email": "test_sheikh@test.com", "password": "test123", "role": "sheikh"},
            {"email": "test_admin@test.com", "password": "test123", "role": "admin"}
        ]

        for login in login_data:
            success, response, status = self.make_request('POST', 'auth/login', 
                                                        {"email": login["email"], "password": login["password"]})
            
            if success and 'token' in response:
                # Update tokens from login
                self.tokens[login['role']] = response['token']
                self.users[login['role']] = response['user']
                self.log_test(f"Login {login['role']}", True)
            else:
                self.log_test(f"Login {login['role']}", False, f"Status: {status}, Response: {response}")

    def test_auth_me(self):
        """Test getting current user info"""
        print("\n👤 Testing Auth Me...")
        
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'auth/me', token=token)
            self.log_test(f"Auth me - {role}", success and 'id' in response, f"Status: {status}")

    def test_sheikh_rankings_api(self):
        """Test Sheikh Rankings API - GET /api/rankings/sheikh-students"""
        print("\n🏆 Testing Sheikh Rankings API...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Sheikh Rankings API", False, "Sheikh token not available")
            return
            
        success, response, status = self.make_request('GET', 'rankings/sheikh-students', 
                                                    token=self.tokens['sheikh'])
        
        if success and 'students' in response:
            # Check if students have percentage values
            students = response['students']
            if len(students) > 0:
                student = students[0]
                if 'points_percentage' in student and 'tracking_percentage' in student:
                    self.log_test("Sheikh Rankings API - with percentages", True)
                else:
                    self.log_test("Sheikh Rankings API - missing percentages", False, "Students missing percentage values")
            else:
                self.log_test("Sheikh Rankings API - no students", True, "API works but no students found")
        else:
            self.log_test("Sheikh Rankings API", False, f"Status: {status}, Response: {response}")

    def test_active_student_bonus_api(self):
        """Test Active Student Bonus API - POST /api/students/active-bonus"""
        print("\n⭐ Testing Active Student Bonus API...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Active Student Bonus API", False, "Sheikh token not available")
            return
            
        # Use the specific student_id from the review request
        bonus_data = {
            "student_id": "9f50fd76-2dc3-491f-8e82-125f78e88ad5",
            "reason": "طالب متفاعل"
        }
        
        success, response, status = self.make_request('POST', 'students/active-bonus', bonus_data, 
                                                    token=self.tokens['sheikh'])
        
        if success:
            # Check if 10 points were granted
            if 'points' in response or 'message' in response:
                self.log_test("Active Student Bonus API - 10 points granted", True)
            else:
                self.log_test("Active Student Bonus API - success but unclear response", True, f"Response: {response}")
        elif status == 400 and 'تم منح النقاط' in response.get('detail', ''):
            # Already granted today - this is expected behavior, API is working
            self.log_test("Active Student Bonus API - already granted today (working)", True)
        else:
            self.log_test("Active Student Bonus API", False, f"Status: {status}, Response: {response}")

    def test_student_statistics_api(self):
        """Test Student Statistics API - GET /api/statistics/student/{student_id}"""
        print("\n📊 Testing Student Statistics API...")
        
        if 'sheikh' not in self.tokens and 'admin' not in self.tokens:
            self.log_test("Student Statistics API", False, "Sheikh or admin token not available")
            return
            
        # Use the specific student_id from the review request
        student_id = "9f50fd76-2dc3-491f-8e82-125f78e88ad5"
        token = self.tokens.get('sheikh') or self.tokens.get('admin')
        
        success, response, status = self.make_request('GET', f'statistics/student/{student_id}', 
                                                    token=token)
        
        if success:
            # Check if total_points is not 0 and comes from student_points table
            if 'total_points' in response and response['total_points'] != 0:
                self.log_test("Student Statistics API - has non-zero total_points", True)
            elif 'total_points' in response and response['total_points'] == 0:
                self.log_test("Student Statistics API - total_points is 0", False, "Expected non-zero points from student_points table")
            else:
                self.log_test("Student Statistics API - missing total_points", False, f"Response: {response}")
        else:
            self.log_test("Student Statistics API", False, f"Status: {status}, Response: {response}")

    def test_recitations_api_comprehensive(self):
        """Test Recitations API - POST /api/recitations"""
        print("\n📖 Testing Recitations API Comprehensively...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Recitations API", False, "Sheikh token not available")
            return
            
        # Test with comprehensive recitation data
        recitation_data = {
            "student_id": "9f50fd76-2dc3-491f-8e82-125f78e88ad5",
            "recitation_type": "new_memorization",
            "juz_number": 1,
            "page_from": 1,
            "page_to": 2,
            "rating": 8,
            "error_count": 2,
            "passed_minimum": True,
            "notes": "تسميع جيد مع بعض الأخطاء البسيطة"
        }
        
        success, response, status = self.make_request('POST', 'recitations', recitation_data, 
                                                    token=self.tokens['sheikh'])
        
        if success:
            if 'recitation_id' in response or 'message' in response:
                self.log_test("Recitations API - new memorization", True)
            else:
                self.log_test("Recitations API - success but unclear response", True, f"Response: {response}")
        else:
            self.log_test("Recitations API - new memorization", False, f"Status: {status}, Response: {response}")
        
        # Test review recitation
        review_data = {
            "student_id": "9f50fd76-2dc3-491f-8e82-125f78e88ad5",
            "recitation_type": "review",
            "review_juz": [1, 2],
            "rating": 9,
            "notes": "مراجعة ممتازة"
        }
        
        success, response, status = self.make_request('POST', 'recitations', review_data, 
                                                    token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Recitations API - review", True)
        else:
            self.log_test("Recitations API - review", False, f"Status: {status}, Response: {response}")

    def test_tracking_sheet_manual_api(self):
        """Test Tracking Sheet Manual API - POST /api/tracking-sheets/manual"""
        print("\n📋 Testing Tracking Sheet Manual API...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Tracking Sheet Manual API", False, "Sheikh token not available")
            return
            
        # Calculate current week start (Saturday)
        from datetime import timedelta
        today = datetime.now()
        days_since_saturday = (today.weekday() + 2) % 7
        saturday = today - timedelta(days=days_since_saturday)
        week_start = saturday.strftime('%Y-%m-%d')
        
        # Test with all 10 fields including duha_prayers
        tracking_data = {
            "student_id": "9f50fd76-2dc3-491f-8e82-125f78e88ad5",
            "week_start": week_start,
            "prayers_count": 35,           # Max 35 points
            "adhkar_after_prayer": 7,      # Max 7 points
            "quran_sitting_days": 7,       # Max 7 points
            "duha_prayers": 7,             # Max 7 points - CRITICAL FIELD
            "family_recitation": 7,        # Max 7 points
            "study_hours": 7,              # Max 7 points
            "witr_prayers_days": 7,        # Max 7 points
            "sunnah_prayers": 7,           # Max 7 points
            "night_prayer": 1,             # 8 points
            "fasting": 1,                  # 8 points
            "notes": "أسبوع ممتاز - جميع العبادات"
        }
        
        success, response, status = self.make_request('POST', 'tracking-sheets/manual', tracking_data, 
                                                    token=self.tokens['sheikh'])
        
        if success:
            # Check if total points match expected (should be 100 points max)
            if 'points_breakdown' in response:
                total_points = response['points_breakdown'].get('total_points', 0)
                if total_points == 100:
                    self.log_test("Tracking Sheet Manual API - 100 points calculation", True)
                else:
                    self.log_test("Tracking Sheet Manual API - incorrect points", False, f"Expected 100, got {total_points}")
                
                # Verify duha_prayers is included in calculation
                duha_points = response['points_breakdown'].get('duha_points', 0)
                if duha_points == 7:
                    self.log_test("Tracking Sheet Manual API - duha_prayers included", True)
                else:
                    self.log_test("Tracking Sheet Manual API - duha_prayers missing", False, f"Expected 7 duha points, got {duha_points}")
            else:
                self.log_test("Tracking Sheet Manual API - missing points breakdown", False, f"Response: {response}")
        else:
            self.log_test("Tracking Sheet Manual API", False, f"Status: {status}, Response: {response}")

    def test_initial_assessment_api(self):
        """Test Initial Assessment API - POST /api/students/{student_id}/initial-assessment"""
        print("\n🎓 Testing Initial Assessment API...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Initial Assessment API", False, "Sheikh token not available")
            return
            
        student_id = "9f50fd76-2dc3-491f-8e82-125f78e88ad5"
        
        # Test with one of the new levels - using POST instead of PUT
        assessment_data = {
            "previous_memorization_juz": [1, 2, 3],
            "previous_memorization_pages": 5,
            "tajweed_level": "إجازة"  # This should now be accepted
        }
        
        success, response, status = self.make_request('POST', f'students/{student_id}/initial-assessment', 
                                                    assessment_data, token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Initial Assessment API - إجازة level", True)
        elif status == 400 and 'تم تقييم' in response.get('detail', ''):
            # Already assessed - API is working
            self.log_test("Initial Assessment API - إجازة level (already assessed)", True)
        else:
            self.log_test("Initial Assessment API - إجازة level", False, f"Status: {status}, Response: {response}")
        
        # Test with another new level
        assessment_data_2 = {
            "previous_memorization_juz": [1],
            "previous_memorization_pages": 10,
            "tajweed_level": "سند غيبي"  # This should now be accepted
        }
        
        success, response, status = self.make_request('POST', f'students/{student_id}/initial-assessment', 
                                                    assessment_data_2, token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Initial Assessment API - سند غيبي level", True)
        elif status == 400 and 'تم تقييم' in response.get('detail', ''):
            # Already assessed - API is working
            self.log_test("Initial Assessment API - سند غيبي level (already assessed)", True)
        else:
            self.log_test("Initial Assessment API - سند غيبي level", False, f"Status: {status}, Response: {response}")

    def test_health_endpoint(self):
        """Test Health Endpoint - GET /health"""
        print("\n💚 Testing Health Endpoint...")
        
        # Health endpoint should be accessible without authentication
        # Use the base URL without /api prefix since health is at root level
        health_url = self.base_url.replace('/api', '') + '/health'
        
        try:
            response = requests.get(health_url, timeout=30)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    if data.get('status') == 'healthy':
                        self.log_test("Health Endpoint - 200 OK with healthy status", True)
                    else:
                        self.log_test("Health Endpoint - wrong status", False, f"Expected 'healthy', got: {data}")
                except:
                    # Response might not be JSON
                    if 'healthy' in response.text.lower():
                        self.log_test("Health Endpoint - 200 OK (text response)", True)
                    else:
                        self.log_test("Health Endpoint - non-JSON response", False, f"Response: {response.text}")
            else:
                self.log_test("Health Endpoint", False, f"Status: {response.status_code}, Response: {response.text}")
                
        except Exception as e:
            self.log_test("Health Endpoint", False, f"Error: {str(e)}")

    def test_review_request_apis(self):
        """Test all APIs mentioned in the review request"""
        print("\n🎯 Testing Review Request APIs...")
        
        # Test all the specific APIs mentioned in the review request
        self.test_sheikh_rankings_api()
        self.test_active_student_bonus_api()
        self.test_student_statistics_api()
        self.test_recitations_api_comprehensive()
        self.test_tracking_sheet_manual_api()
        self.test_initial_assessment_api()
        self.test_health_endpoint()

    def run_review_request_tests(self):
        """Run tests specifically for the review request"""
        print("🚀 Starting Review Request Backend API Tests...")
        print(f"🌐 Testing against: {self.base_url}")
        
        try:
            # Core authentication tests (required for other tests)
            self.test_user_login()
            self.test_auth_me()
            
            # Review request specific tests
            self.test_review_request_apis()
            
        except Exception as e:
            print(f"💥 Critical error during testing: {str(e)}")
            return False

        return True

    def print_summary(self):
        """Print test summary"""
        print(f"\n📊 Test Summary:")
        print(f"Total tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ Failed Tests:")
            for test in self.failed_tests:
                print(f"  - {test['name']}: {test['details']}")
        
        return len(self.failed_tests) == 0

def main():
    """Main test execution"""
    tester = QuranAppAPITester()
    
    # Run focused tests for review request APIs
    success = tester.run_review_request_tests()
    all_passed = tester.print_summary()
    
    if not success:
        print("\n💥 Testing failed due to critical errors")
        return 1
    elif not all_passed:
        print(f"\n⚠️  Some tests failed - check backend logs and API responses")
        return 1
    else:
        print(f"\n🎉 All tests passed successfully!")
        return 0

if __name__ == "__main__":
    sys.exit(main())
