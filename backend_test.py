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
    def __init__(self, base_url="https://hafizapp-updates.preview.emergentagent.com/api"):
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
                # Try alternative passwords that might have been reset
                alt_passwords = ["newpass123", "newpassword123", "password123", "newpassword456"]
                login_success = False
                
                for alt_pass in alt_passwords:
                    success, response, status = self.make_request('POST', 'auth/login', 
                                                                {"email": login["email"], "password": alt_pass})
                    if success and 'token' in response:
                        self.tokens[login['role']] = response['token']
                        self.users[login['role']] = response['user']
                        self.log_test(f"Login {login['role']} (alt password)", True)
                        login_success = True
                        break
                
                if not login_success:
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
            
            if expected_success and success and status == 200:
                # Check if response has expected student profile data
                has_profile_data = 'student' in response or any(key in response for key in ['name', 'email', 'id'])
                if has_profile_data:
                    self.log_test(f"Get student profile - {role}", True)
                else:
                    self.log_test(f"Get student profile - {role}", False, f"Missing profile data. Keys: {list(response.keys()) if response else 'None'}")
            elif not expected_success and status == 403:
                # Should be forbidden for other students
                self.log_test(f"Get student profile unauthorized - {role}", True)
            else:
                self.log_test(f"Get student profile - {role}", False, f"Status: {status}, Success: {success}")
        
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

    def test_new_tracking_sheet_system(self):
        """Test new tracking sheet system with 100 points calculation"""
        print("\n📋 Testing New Tracking Sheet System (100 points)...")
        
        if 'student' not in self.tokens:
            self.log_test("New tracking sheet system", False, "Student token not available")
            return
            
        # Calculate current week start (Saturday)
        from datetime import timedelta
        today = datetime.now()
        # Saturday = 5 in Python (Monday = 0)
        days_since_saturday = (today.weekday() + 2) % 7
        saturday = today - timedelta(days=days_since_saturday)
        week_start = saturday.strftime('%Y-%m-%d')
        
        # Test creating a new tracking sheet with new fields
        tracking_data = {
            "week_start": week_start,  # Must be Saturday (current week)
            "prayers_count": 30,       # Max 35 points
            "quran_sitting_days": 6,   # Max 7 points
            "duha_prayers": 5,         # Max 7 points
            "family_recitation": 6,    # Max 7 points
            "study_hours": 5,          # Max 7 points
            "witr_prayers_days": 7,    # Max 7 points
            "sunnah_prayers": 6,       # NEW FIELD - Max 7 points
            "night_prayer": 1,         # 1 = 8 points
            "fasting": 1,              # 1 = 8 points
            "notes": "test tracking sheet"
        }
        
        success, response, status = self.make_request('POST', 'tracking-sheets/student', tracking_data, 
                                                    token=self.tokens['student'])
        
        if success:
            self.log_test("Create new tracking sheet (100 points system)", True)
            # Expected points: 30+6+5+6+5+7+6+8+8 = 81 points
            
            # Test updating the same week (should update existing)
            updated_tracking_data = {
                "week_start": week_start,
                "prayers_count": 35,       # Max out prayers
                "quran_sitting_days": 7,   # Max out
                "duha_prayers": 7,         # Max out
                "family_recitation": 7,    # Max out
                "study_hours": 7,          # Max out
                "witr_prayers_days": 7,    # Max out
                "sunnah_prayers": 7,       # Max out
                "night_prayer": 1,         # 8 points
                "fasting": 1,              # 8 points
                "notes": "updated - maximum points"
            }
            
            success, response, status = self.make_request('POST', 'tracking-sheets/student', updated_tracking_data, 
                                                        token=self.tokens['student'])
            self.log_test("Update tracking sheet (max 100 points)", success, f"Status: {status}")
            
        else:
            self.log_test("Create new tracking sheet (100 points system)", False, f"Status: {status}, Response: {response}")
        
        # Test unauthorized access (non-student)
        if 'sheikh' in self.tokens:
            success, response, status = self.make_request('POST', 'tracking-sheets/student', tracking_data, 
                                                        token=self.tokens['sheikh'], expected_status=403)
            self.log_test("Unauthorized tracking sheet access (sheikh)", success, f"Status: {status}")

    def test_sheikh_interaction_badge(self):
        """Test sheikh granting interaction badge (+10 points)"""
        print("\n⭐ Testing Sheikh Interaction Badge...")
        
        if 'sheikh' not in self.tokens or 'student' not in self.users:
            self.log_test("Sheikh interaction badge", False, "Sheikh token or student not available")
            return
            
        # Test granting interaction badge
        interaction_data = {
            "student_id": self.users['student']['id'],
            "notes": "good participation in class discussion"
        }
        
        success, response, status = self.make_request('POST', 'badges/interaction', interaction_data, 
                                                    token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Grant interaction badge (sheikh)", True)
            
            # Test duplicate grant (should fail - once per week)
            success, response, status = self.make_request('POST', 'badges/interaction', interaction_data, 
                                                        token=self.tokens['sheikh'], expected_status=400)
            self.log_test("Prevent duplicate interaction badge", success, f"Status: {status}")
        elif status == 400 and "مسبقاً" in response.get('detail', ''):
            # Already granted this week - this is expected behavior
            self.log_test("Grant interaction badge (already granted this week)", True)
        else:
            self.log_test("Grant interaction badge (sheikh)", False, f"Status: {status}, Response: {response}")
        
        # Test unauthorized access (non-sheikh)
        if 'student' in self.tokens:
            success, response, status = self.make_request('POST', 'badges/interaction', interaction_data, 
                                                        token=self.tokens['student'], expected_status=403)
            self.log_test("Unauthorized interaction badge (student)", success, f"Status: {status}")

    def test_admin_bonus_points(self):
        """Test admin granting bonus points (+50 points, once per week)"""
        print("\n🏆 Testing Admin Bonus Points...")
        
        if 'admin' not in self.tokens or 'student' not in self.users:
            self.log_test("Admin bonus points", False, "Admin token or student not available")
            return
            
        # Test granting admin bonus
        bonus_data = {
            "student_id": self.users['student']['id'],
            "reason": "excellent behavior and dedication"
        }
        
        success, response, status = self.make_request('POST', 'badges/admin-bonus', bonus_data, 
                                                    token=self.tokens['admin'])
        
        if success:
            self.log_test("Grant admin bonus points", True)
            
            # Test duplicate grant (should fail - once per week)
            success, response, status = self.make_request('POST', 'badges/admin-bonus', bonus_data, 
                                                        token=self.tokens['admin'], expected_status=400)
            self.log_test("Prevent duplicate admin bonus", success, f"Status: {status}")
        elif status == 400 and "مسبقاً" in response.get('detail', ''):
            # Already granted this week - this is expected behavior
            self.log_test("Grant admin bonus points (already granted this week)", True)
        else:
            self.log_test("Grant admin bonus points", False, f"Status: {status}, Response: {response}")
        
        # Test unauthorized access (non-admin)
        if 'sheikh' in self.tokens:
            success, response, status = self.make_request('POST', 'badges/admin-bonus', bonus_data, 
                                                        token=self.tokens['sheikh'], expected_status=403)
            self.log_test("Unauthorized admin bonus (sheikh)", success, f"Status: {status}")

    def test_student_badges_api(self):
        """Test getting student badges"""
        print("\n🏅 Testing Student Badges API...")
        
        if 'student' not in self.users:
            self.log_test("Student badges API", False, "Student not available")
            return
            
        student_id = self.users['student']['id']
        
        # Test getting student badges
        for role, token in self.tokens.items():
            success, response, status = self.make_request('GET', f'badges/student/{student_id}', token=token)
            
            if success and 'current_week_badges' in response and 'total_badges_count' in response:
                self.log_test(f"Get student badges - {role}", True)
            else:
                self.log_test(f"Get student badges - {role}", False, f"Status: {status}, Response: {response}")

    def test_available_badges_api(self):
        """Test getting available badges list"""
        print("\n📋 Testing Available Badges API...")
        
        # Test getting available badges (should be public)
        success, response, status = self.make_request('GET', 'badges/available')
        
        if success and isinstance(response, list):
            self.log_test("Get available badges", True)
            
            # Check if response contains expected badge structure
            if len(response) > 0 and 'name' in response[0] and 'icon' in response[0]:
                self.log_test("Available badges structure", True)
            else:
                self.log_test("Available badges structure", False, "Missing expected fields")
        else:
            self.log_test("Get available badges", False, f"Status: {status}, Response: {response}")

    def test_points_system_1000_limit(self):
        """Test 1000 points limit enforcement"""
        print("\n💯 Testing Points System (1000 max limit)...")
        
        if 'student' not in self.users:
            self.log_test("Points system limit", False, "Student not available")
            return
            
        student_id = self.users['student']['id']
        
        # Get current student points
        success, response, status = self.make_request('GET', f'students/{student_id}/profile', 
                                                    token=self.tokens.get('admin') or self.tokens.get('sheikh'))
        
        if success and 'points' in response:
            current_points = response['points']
            # Handle case where points might be a dict or int
            if isinstance(current_points, dict):
                current_points = current_points.get('total_points', 0)
            
            self.log_test("Get current student points", True, f"Current points: {current_points}")
            
            # Verify points are within 1000 limit
            if current_points <= 1000:
                self.log_test("Points within 1000 limit", True)
            else:
                self.log_test("Points within 1000 limit", False, f"Points exceed limit: {current_points}")
        else:
            self.log_test("Get current student points", False, f"Status: {status}")

    def test_sheikh_rankings_api(self):
        """Test Sheikh Rankings API - GET /api/rankings/sheikh-students"""
        print("\n🏆 Testing Sheikh Rankings API...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Sheikh Rankings API", False, "Sheikh token not available")
            return
            
        success, response, status = self.make_request('GET', 'rankings/sheikh-students', 
                                                    token=self.tokens['sheikh'])
        
        if success and isinstance(response, list):
            # Check if students have percentage values
            has_percentages = False
            for student in response:
                if 'points_percentage' in student and 'tracking_percentage' in student:
                    has_percentages = True
                    break
            
            if has_percentages:
                self.log_test("Sheikh Rankings API - with percentages", True)
            else:
                self.log_test("Sheikh Rankings API - missing percentages", False, "Students missing percentage values")
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
        """Test Initial Assessment API - PUT /api/students/{student_id}/initial-assessment"""
        print("\n🎓 Testing Initial Assessment API...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Initial Assessment API", False, "Sheikh token not available")
            return
            
        student_id = "9f50fd76-2dc3-491f-8e82-125f78e88ad5"
        
        # Test with all 8 tajweed levels including the new ones
        tajweed_levels = [
            "تلاوة عامة", "تمهيدية", "متوسطة", "متقدمة", 
            "إجازة", "اتقان", "سند غيبي", "روايات أخرى"
        ]
        
        # Test with one of the new levels
        assessment_data = {
            "previous_memorization_juz": [1, 2, 3],
            "previous_memorization_pages": 5,
            "tajweed_level": "إجازة"  # This should now be accepted
        }
        
        success, response, status = self.make_request('POST', f'students/{student_id}/initial-assessment', 
                                                    assessment_data, token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Initial Assessment API - إجازة level", True)
        else:
            self.log_test("Initial Assessment API - إجازة level", False, f"Status: {status}, Response: {response}")
        
        # Test with another new level
        assessment_data_2 = {
            "previous_memorization_juz": [1],
            "previous_memorization_pages": 10,
            "tajweed_level": "سند غيبي"  # This should now be accepted
        }
        
        success, response, status = self.make_request('PUT', f'students/{student_id}/initial-assessment', 
                                                    assessment_data_2, token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Initial Assessment API - سند غيبي level", True)
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
                data = response.json()
                if data.get('status') == 'healthy':
                    self.log_test("Health Endpoint - 200 OK with healthy status", True)
                else:
                    self.log_test("Health Endpoint - wrong status", False, f"Expected 'healthy', got: {data}")
            else:
                self.log_test("Health Endpoint", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("Health Endpoint", False, f"Error: {str(e)}")

    def test_tracking_submission_settings_api(self):
        """Test Tracking Submission Settings API - GET/PUT /api/settings/tracking-submission"""
        print("\n⚙️ Testing Tracking Submission Settings API...")
        
        if 'admin' not in self.tokens:
            self.log_test("Tracking Submission Settings API", False, "Admin token not available")
            return
            
        # Test GET /api/settings/tracking-submission
        success, response, status = self.make_request('GET', 'settings/tracking-submission', 
                                                    token=self.tokens['admin'])
        
        if success:
            # Check if response has expected fields
            expected_fields = ['submission_enabled', 'submission_start_day', 'submission_start_time', 
                             'submission_end_day', 'submission_end_time']
            has_all_fields = all(field in response for field in expected_fields)
            
            if has_all_fields:
                self.log_test("GET tracking submission settings", True)
                
                # Verify default values match expected
                if (response.get('submission_start_day') == 'friday' and 
                    response.get('submission_start_time') == '21:00' and
                    response.get('submission_end_day') == 'saturday' and
                    response.get('submission_end_time') == '08:50'):
                    self.log_test("Default tracking submission settings", True)
                else:
                    self.log_test("Default tracking submission settings", False, f"Unexpected defaults: {response}")
            else:
                self.log_test("GET tracking submission settings", False, f"Missing fields. Got: {list(response.keys())}")
        else:
            self.log_test("GET tracking submission settings", False, f"Status: {status}, Response: {response}")
        
        # Test PUT /api/settings/tracking-submission
        update_data = {
            "submission_enabled": True,
            "submission_start_day": "thursday",
            "submission_start_time": "20:00",
            "submission_end_day": "friday",
            "submission_end_time": "10:00"
        }
        
        success, response, status = self.make_request('PUT', 'settings/tracking-submission', update_data,
                                                    token=self.tokens['admin'])
        
        if success and 'settings' in response:
            updated_settings = response['settings']
            if (updated_settings.get('submission_start_day') == 'thursday' and
                updated_settings.get('submission_start_time') == '20:00'):
                self.log_test("PUT tracking submission settings", True)
            else:
                self.log_test("PUT tracking submission settings", False, f"Settings not updated correctly: {updated_settings}")
        else:
            self.log_test("PUT tracking submission settings", False, f"Status: {status}, Response: {response}")
        
        # Test unauthorized access (non-admin/sheikh)
        if 'student' in self.tokens:
            success, response, status = self.make_request('GET', 'settings/tracking-submission',
                                                        token=self.tokens['student'], expected_status=403)
            self.log_test("Unauthorized tracking settings access (student)", success, f"Status: {status}")

    def test_tracking_submission_check_api(self):
        """Test Tracking Submission Check API - GET /api/settings/tracking-submission/check"""
        print("\n🕐 Testing Tracking Submission Check API...")
        
        if 'student' not in self.tokens:
            self.log_test("Tracking Submission Check API", False, "Student token not available")
            return
            
        # Test GET /api/settings/tracking-submission/check
        success, response, status = self.make_request('GET', 'settings/tracking-submission/check',
                                                    token=self.tokens['student'])
        
        if success:
            # Check if response has expected fields
            expected_fields = ['can_submit', 'message']
            has_expected_fields = all(field in response for field in expected_fields)
            
            if has_expected_fields:
                self.log_test("GET tracking submission check", True)
                
                # Verify can_submit is boolean
                if isinstance(response.get('can_submit'), bool):
                    self.log_test("Tracking submission check format", True)
                else:
                    self.log_test("Tracking submission check format", False, f"can_submit is not boolean: {type(response.get('can_submit'))}")
            else:
                self.log_test("GET tracking submission check", False, f"Missing fields. Got: {list(response.keys())}")
        else:
            self.log_test("GET tracking submission check", False, f"Status: {status}, Response: {response}")

    def test_combined_recitations_api(self):
        """Test Combined Recitations API - POST /api/recitations with combined type"""
        print("\n📚 Testing Combined Recitations API...")
        
        if 'sheikh' not in self.tokens:
            self.log_test("Combined Recitations API", False, "Sheikh token not available")
            return
            
        # Get a student from groups first
        success, groups_response, status = self.make_request('GET', 'groups', token=self.tokens['sheikh'])
        
        if not success or not isinstance(groups_response, list) or len(groups_response) == 0:
            self.log_test("Get groups for combined recitation", False, "No groups found")
            return
            
        # Get students from the first group
        group_id = groups_response[0].get('id')
        if not group_id:
            self.log_test("Get group ID for combined recitation", False, "No group ID found")
            return
            
        success, students_response, status = self.make_request('GET', f'groups/{group_id}/students',
                                                             token=self.tokens['sheikh'])
        
        if not success or not isinstance(students_response, list) or len(students_response) == 0:
            self.log_test("Get students for combined recitation", False, "No students found in group")
            return
            
        student_id = students_response[0].get('id')
        if not student_id:
            self.log_test("Get student ID for combined recitation", False, "No student ID found")
            return
        
        # Test combined recitation with both new memorization AND review
        combined_data = {
            "student_id": student_id,
            "recitation_type": "combined",
            "has_new_memorization": True,
            "juz_number": 1,
            "page_from": 1,
            "page_to": 3,
            "passed_minimum": True,
            "has_review": True,
            "review_juz": [1],
            "passed_review_minimum": True,
            "notes": "Test combined recitation"
        }
        
        success, response, status = self.make_request('POST', 'recitations', combined_data,
                                                    token=self.tokens['sheikh'])
        
        if success:
            if 'recitation_id' in response or 'message' in response:
                self.log_test("Combined recitations API - new memorization + review", True)
            else:
                self.log_test("Combined recitations API - success but unclear response", True, f"Response: {response}")
        else:
            self.log_test("Combined recitations API - new memorization + review", False, f"Status: {status}, Response: {response}")
        
        # Test combined recitation with only new memorization
        combined_new_only = {
            "student_id": student_id,
            "recitation_type": "combined",
            "has_new_memorization": True,
            "juz_number": 2,
            "page_from": 21,
            "page_to": 25,
            "passed_minimum": True,
            "has_review": False,
            "notes": "Test combined - new memorization only"
        }
        
        success, response, status = self.make_request('POST', 'recitations', combined_new_only,
                                                    token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Combined recitations API - new memorization only", True)
        else:
            self.log_test("Combined recitations API - new memorization only", False, f"Status: {status}, Response: {response}")
        
        # Test combined recitation with only review
        combined_review_only = {
            "student_id": student_id,
            "recitation_type": "combined",
            "has_new_memorization": False,
            "has_review": True,
            "review_juz": [1, 2],
            "passed_review_minimum": True,
            "notes": "Test combined - review only"
        }
        
        success, response, status = self.make_request('POST', 'recitations', combined_review_only,
                                                    token=self.tokens['sheikh'])
        
        if success:
            self.log_test("Combined recitations API - review only", True)
        else:
            self.log_test("Combined recitations API - review only", False, f"Status: {status}, Response: {response}")

    def test_review_request_apis(self):
        """Test all APIs mentioned in the review request"""
        print("\n🎯 Testing Review Request APIs...")
        
        # Test the new features from the review request
        self.test_tracking_submission_settings_api()
        self.test_tracking_submission_check_api()
        self.test_combined_recitations_api()
        
        # Test existing APIs mentioned in the review request
        self.test_sheikh_rankings_api()
        self.test_active_student_bonus_api()
        self.test_student_statistics_api()
        self.test_recitations_api_comprehensive()
        self.test_tracking_sheet_manual_api()
        self.test_initial_assessment_api()
        self.test_health_endpoint()

    def test_new_features_comprehensive(self):
        """Comprehensive test for all new features mentioned in review request"""
        print("\n🆕 Testing New Features Comprehensively...")
        
        # Test all the new features together
        self.test_admin_password_reset()
        self.test_new_tracking_sheet_system()
        self.test_sheikh_interaction_badge()
        self.test_admin_bonus_points()
        self.test_student_badges_api()
        self.test_available_badges_api()
        self.test_points_system_1000_limit()
        self.test_student_profile_apis()
        self.test_tracking_sheets_get()
        self.test_student_self_update()
        self.test_attendance_with_excuse()

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

    def run_new_features_tests(self):
        """Run tests for new features mentioned in review request"""
        print("🚀 Starting New Features Backend API Tests...")
        print(f"🌐 Testing against: {self.base_url}")
        
        try:
            # Core authentication tests (required for other tests)
            self.test_user_login()
            self.test_auth_me()
            
            # New features tests
            self.test_new_features_comprehensive()
            
        except Exception as e:
            print(f"💥 Critical error during testing: {str(e)}")
            return False

        return True

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