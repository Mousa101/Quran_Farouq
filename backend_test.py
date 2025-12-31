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
    def __init__(self, base_url="https://islamic-edu-system.preview.emergentagent.com/api"):
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

    def test_user_registration(self):
        """Test user registration for all roles"""
        print("\n🔐 Testing User Registration...")
        
        users_to_create = [
            {"name": "أحمد الطالب", "email": "student@test.com", "password": "password123", "role": "student"},
            {"name": "محمد الشيخ", "email": "sheikh@test.com", "password": "password123", "role": "sheikh"},
            {"name": "علي المدير", "email": "admin@test.com", "password": "password123", "role": "admin"}
        ]

        for user_data in users_to_create:
            success, response, status = self.make_request('POST', 'auth/register', user_data, expected_status=200)
            
            if success and 'token' in response:
                self.tokens[user_data['role']] = response['token']
                self.users[user_data['role']] = response['user']
                self.log_test(f"Register {user_data['role']}", True)
            else:
                self.log_test(f"Register {user_data['role']}", False, f"Status: {status}, Response: {response}")

    def test_user_login(self):
        """Test user login with provided test credentials"""
        print("\n🔑 Testing User Login...")
        
        # Use the provided test credentials from the review request
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

    def test_groups_management(self):
        """Test group creation and management"""
        print("\n👥 Testing Groups Management...")
        
        # Sheikh creates a group
        if 'sheikh' in self.tokens:
            group_data = {
                "name": "مجموعة الفجر",
                "description": "مجموعة حفظ القرآن الكريم"
            }
            
            success, response, status = self.make_request('POST', 'groups', group_data, 
                                                        token=self.tokens['sheikh'])
            
            if success and 'group_id' in response:
                self.test_data['group_id'] = response['group_id']
                self.log_test("Create group", True)
            else:
                self.log_test("Create group", False, f"Status: {status}, Response: {response}")

        # Get groups
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'groups', token=token)
            self.log_test(f"Get groups - {role}", success and isinstance(response, list), f"Status: {status}")

        # Add student to group
        if 'sheikh' in self.tokens and 'group_id' in self.test_data and 'student' in self.users:
            student_id = self.users['student']['id']
            group_id = self.test_data['group_id']
            
            # The endpoint expects student_id as a query parameter, not in body
            success, response, status = self.make_request('POST', f'groups/{group_id}/add-student?student_id={student_id}', 
                                                        None, token=self.tokens['sheikh'])
            self.log_test("Add student to group", success, f"Status: {status}")

    def test_recitations(self):
        """Test recitation recording"""
        print("\n📖 Testing Recitations...")
        
        if 'sheikh' in self.tokens and 'student' in self.users:
            recitation_data = {
                "student_id": self.users['student']['id'],
                "surah_name": "الفاتحة",
                "verses_from": 1,
                "verses_to": 7,
                "quality_score": 8,
                "mistakes_count": 1,
                "notes": "تسميع جيد"
            }
            
            success, response, status = self.make_request('POST', 'recitations', recitation_data, 
                                                        token=self.tokens['sheikh'])
            
            if success and 'recitation_id' in response:
                self.test_data['recitation_id'] = response['recitation_id']
                self.log_test("Record recitation", True)
            else:
                self.log_test("Record recitation", False, f"Status: {status}, Response: {response}")

        # Get recitations
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'recitations', token=token)
            self.log_test(f"Get recitations - {role}", success and isinstance(response, list), f"Status: {status}")

    def test_attendance(self):
        """Test attendance marking"""
        print("\n📅 Testing Attendance...")
        
        if 'sheikh' in self.tokens and 'student' in self.users:
            attendance_data = {
                "student_id": self.users['student']['id'],
                "date": datetime.now().strftime("%Y-%m-%d"),
                "status": "present"
            }
            
            success, response, status = self.make_request('POST', 'attendance', attendance_data, 
                                                        token=self.tokens['sheikh'])
            self.log_test("Mark attendance", success, f"Status: {status}")

        # Get attendance
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'attendance', token=token)
            self.log_test(f"Get attendance - {role}", success and isinstance(response, list), f"Status: {status}")

    def test_activities(self):
        """Test activities management"""
        print("\n🎯 Testing Activities...")
        
        if 'admin' in self.tokens:
            activity_data = {
                "title": "مسابقة حفظ القرآن",
                "description": "مسابقة شهرية لحفظة القرآن الكريم",
                "date": (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d"),
                "time": "09:00",
                "location": "المسجد الكبير"
            }
            
            success, response, status = self.make_request('POST', 'activities', activity_data, 
                                                        token=self.tokens['admin'])
            
            if success and 'activity_id' in response:
                self.test_data['activity_id'] = response['activity_id']
                self.log_test("Create activity", True)
            else:
                self.log_test("Create activity", False, f"Status: {status}, Response: {response}")

        # Get activities
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'activities', token=token)
            self.log_test(f"Get activities - {role}", success and isinstance(response, list), f"Status: {status}")

    def test_notifications(self):
        """Test notifications"""
        print("\n🔔 Testing Notifications...")
        
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'notifications', token=token)
            self.log_test(f"Get notifications - {role}", success and isinstance(response, list), f"Status: {status}")

    def test_rankings(self):
        """Test weekly rankings"""
        print("\n🏆 Testing Rankings...")
        
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'rankings/weekly', token=token)
            self.log_test(f"Get rankings - {role}", success and 'scores' in response, f"Status: {status}")

    def test_users_management(self):
        """Test users management"""
        print("\n👥 Testing Users Management...")
        
        # Admin and Sheikh can get users
        for role in ['admin', 'sheikh']:
            if role in self.tokens:
                success, response, status = self.make_request('GET', 'users', token=self.tokens[role])
                self.log_test(f"Get users - {role}", success and isinstance(response, list), f"Status: {status}")

    def test_statistics(self):
        """Test statistics endpoints"""
        print("\n📊 Testing Statistics...")
        
        # Test student statistics
        if 'student' in self.users:
            student_id = self.users['student']['id']
            
            for role, token in self.tokens.items():
                success, response, status = self.make_request('GET', f'statistics/student/{student_id}', 
                                                            token=token)
                expected = role in ['admin', 'sheikh'] or (role == 'student' and token == self.tokens['student'])
                if expected:
                    self.log_test(f"Get student stats - {role}", success and 'tracking' in response, f"Status: {status}")

        # Test overview statistics
        for role in ['admin', 'sheikh']:
            if role in self.tokens:
                success, response, status = self.make_request('GET', 'statistics/overview', 
                                                            token=self.tokens[role])
                self.log_test(f"Get overview stats - {role}", success and 'total_students' in response, f"Status: {status}")

    def test_admin_password_reset(self):
        """Test admin password reset functionality"""
        print("\n🔐 Testing Admin Password Reset...")
        
        if 'admin' not in self.tokens:
            self.log_test("Admin password reset", False, "Admin token not available")
            return
            
        # First, get a list of users to test password reset
        success, users_response, status = self.make_request('GET', 'users?role=student', token=self.tokens['admin'])
        
        if not success or not isinstance(users_response, list) or len(users_response) == 0:
            self.log_test("Get students for password reset", False, f"Status: {status}, No students found")
            return
            
        # Test password reset for a student
        student_email = users_response[0].get('email')
        if student_email:
            reset_data = {
                "email": student_email,
                "new_password": "newpassword123"
            }
            
            success, response, status = self.make_request('POST', 'admin/reset-password', reset_data, 
                                                        token=self.tokens['admin'])
            self.log_test("Reset student password", success, f"Status: {status}, Response: {response}")
        
        # Test password reset for a sheikh
        success, sheikhs_response, status = self.make_request('GET', 'users?role=sheikh', token=self.tokens['admin'])
        
        if success and isinstance(sheikhs_response, list) and len(sheikhs_response) > 0:
            sheikh_email = sheikhs_response[0].get('email')
            if sheikh_email:
                reset_data = {
                    "email": sheikh_email,
                    "new_password": "newpassword456"
                }
                
                success, response, status = self.make_request('POST', 'admin/reset-password', reset_data, 
                                                            token=self.tokens['admin'])
                self.log_test("Reset sheikh password", success, f"Status: {status}, Response: {response}")
        
        # Test unauthorized access (non-admin trying to reset password)
        if 'student' in self.tokens:
            reset_data = {
                "email": "test_student@test.com",
                "new_password": "hackpassword"
            }
            
            success, response, status = self.make_request('POST', 'admin/reset-password', reset_data, 
                                                        token=self.tokens['student'], expected_status=403)
            self.log_test("Unauthorized password reset (student)", success, f"Status: {status}")

    def test_student_tracking_sheet(self):
        """Test student tracking sheet entry"""
        print("\n📋 Testing Student Tracking Sheet Entry...")
        
        if 'student' not in self.tokens:
            self.log_test("Student tracking sheet", False, "Student token not available")
            return
            
        # Get current week start (Sunday)
        today = datetime.now()
        days_since_sunday = today.weekday() + 1 if today.weekday() != 6 else 0
        week_start = (today - timedelta(days=days_since_sunday)).strftime('%Y-%m-%d')
        
        # Test creating a new tracking sheet
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
        
        success, response, status = self.make_request('POST', 'tracking-sheets/student', tracking_data, 
                                                    token=self.tokens['student'])
        
        if success:
            self.log_test("Create student tracking sheet", True)
            self.test_data['tracking_sheet_week'] = week_start
            
            # Test updating the same tracking sheet (should update existing one)
            updated_tracking_data = {
                "week_start": week_start,
                "prayers_count": 32,
                "quran_sitting_days": 7,
                "duha_prayers": 6,
                "family_recitation": 5,
                "study_hours": 7,
                "witr_prayers_days": 7,
                "night_prayer": 1,
                "fasting": 1,
                "notes": "تحديث: أسبوع ممتاز"
            }
            
            success, response, status = self.make_request('POST', 'tracking-sheets/student', updated_tracking_data, 
                                                        token=self.tokens['student'])
            self.log_test("Update student tracking sheet", success, f"Status: {status}, Response: {response}")
        else:
            self.log_test("Create student tracking sheet", False, f"Status: {status}, Response: {response}")
        
        # Test unauthorized access (non-student trying to submit tracking sheet)
        if 'sheikh' in self.tokens:
            success, response, status = self.make_request('POST', 'tracking-sheets/student', tracking_data, 
                                                        token=self.tokens['sheikh'], expected_status=403)
            self.log_test("Unauthorized tracking sheet (sheikh)", success, f"Status: {status}")

    def test_student_profile_apis(self):
        """Test student profile related APIs"""
        print("\n👤 Testing Student Profile APIs...")
        
        if 'student' not in self.users:
            self.log_test("Student profile APIs", False, "Student user not available")
            return
            
        student_id = self.users['student']['id']
        
        # Test GET /api/students/{student_id}/profile
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', f'students/{student_id}/profile', token=token)
            
            # Students can view their own profile, admin/sheikh can view any profile
            expected_success = role in ['admin', 'sheikh'] or (role == 'student' and token == self.tokens['student'])
            
            if expected_success:
                self.log_test(f"Get student profile - {role}", success and 'name' in response, f"Status: {status}")
            else:
                # Should be forbidden for other students
                self.log_test(f"Get student profile unauthorized - {role}", status == 403, f"Status: {status}")
        
        # Test GET /api/students/{student_id}/progress
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', f'students/{student_id}/progress', token=token)
            
            expected_success = role in ['admin', 'sheikh'] or (role == 'student' and token == self.tokens['student'])
            
            if expected_success:
                self.log_test(f"Get student progress - {role}", success and 'total_progress' in response, f"Status: {status}")
            else:
                self.log_test(f"Get student progress unauthorized - {role}", status == 403, f"Status: {status}")

    def test_tracking_sheets_get(self):
        """Test GET tracking sheets API"""
        print("\n📋 Testing GET Tracking Sheets...")
        
        # Test getting tracking sheets for different roles
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', 'tracking-sheets', token=token)
            self.log_test(f"Get tracking sheets - {role}", success and isinstance(response, list), f"Status: {status}")

    def test_student_self_update(self):
        """Test student self-update profile API"""
        print("\n✏️ Testing Student Self Update...")
        
        if 'student' not in self.tokens:
            self.log_test("Student self update", False, "Student token not available")
            return
            
        # Test GET /api/students/me/profile
        success, response, status = self.make_request('GET', 'students/me/profile', token=self.tokens['student'])
        self.log_test("Get student own profile", success, f"Status: {status}")
        
        # Test PUT /api/students/me/profile
        update_data = {
            "student_phone": "0501234567",
            "school_name": "مدرسة الفاروق الابتدائية",
            "school_grade": "الصف السادس",
            "school_average": "95%"
        }
        
        success, response, status = self.make_request('PUT', 'students/me/profile', update_data, 
                                                    token=self.tokens['student'])
        self.log_test("Update student own profile", success, f"Status: {status}, Response: {response}")

    def test_attendance_with_excuse(self):
        """Test attendance with excuse reason"""
        print("\n📅 Testing Attendance with Excuse...")
        
        if 'sheikh' not in self.tokens or 'student' not in self.users:
            self.log_test("Attendance with excuse", False, "Sheikh token or student not available")
            return
            
        # Test marking attendance with excuse reason
        attendance_data = {
            "student_id": self.users['student']['id'],
            "date": datetime.now().strftime("%Y-%m-%d"),
            "status": "excused",
            "excuse_reason": "مريض - حمى شديدة"
        }
        
        success, response, status = self.make_request('POST', 'attendance', attendance_data, 
                                                    token=self.tokens['sheikh'])
        self.log_test("Mark attendance with excuse", success, f"Status: {status}, Response: {response}")
        
        # Test marking regular attendance without excuse
        attendance_data_regular = {
            "student_id": self.users['student']['id'],
            "date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"),
            "status": "present"
        }
        
        success, response, status = self.make_request('POST', 'attendance', attendance_data_regular, 
                                                    token=self.tokens['sheikh'])
        self.log_test("Mark regular attendance", success, f"Status: {status}")

    def test_new_features_comprehensive(self):
        """Comprehensive test for all new features mentioned in review request"""
        print("\n🆕 Testing New Features Comprehensively...")
        
        # Test all the new features together
        self.test_admin_password_reset()
        self.test_student_tracking_sheet()
        self.test_student_profile_apis()
        self.test_tracking_sheets_get()
        self.test_student_self_update()
        self.test_attendance_with_excuse()

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting Quran App Backend API Tests...")
        print(f"🌐 Testing against: {self.base_url}")
        
        try:
            # Core authentication tests
            self.test_user_registration()
            self.test_user_login()
            self.test_auth_me()
            
            # Feature tests
            self.test_groups_management()
            self.test_recitations()
            self.test_attendance()
            self.test_activities()
            self.test_notifications()
            self.test_rankings()
            self.test_users_management()
            self.test_statistics()
            self.test_tracking_sheets()
            
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
    
    success = tester.run_all_tests()
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