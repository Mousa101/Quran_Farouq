"""
Test Term Management APIs and Student Statistics
Tests for:
- /api/terms/active - Get active term
- /api/terms/close-and-start-new - Close term and start new one
- /api/statistics/student/{id} - Get student statistics
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_admin@test.com"
ADMIN_PASSWORD = "test123"
STUDENT_EMAIL = "test_student@test.com"
STUDENT_PASSWORD = "test123"


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ API health check passed")


class TestAuthentication:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['name']}")
        return data["token"]
    
    def test_student_login(self):
        """Test student login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "student"
        print(f"✓ Student login successful: {data['user']['name']}")
        return data["token"], data["user"]["id"]


class TestTermManagement:
    """Term management API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin authentication failed")
        return response.json()["token"]
    
    @pytest.fixture
    def student_auth(self):
        """Get student authentication token and ID"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Student authentication failed")
        data = response.json()
        return data["token"], data["user"]["id"]
    
    def test_get_active_term_with_admin(self, admin_token):
        """Test GET /api/terms/active with admin token"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/terms/active", headers=headers)
        
        assert response.status_code == 200, f"Failed to get active term: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "name" in data, "Response should contain 'name'"
        assert "is_active" in data, "Response should contain 'is_active'"
        assert data["is_active"] == True, "Term should be active"
        
        print(f"✓ Active term retrieved: {data['name']}")
        return data
    
    def test_get_active_term_with_student(self, student_auth):
        """Test GET /api/terms/active with student token"""
        token, _ = student_auth
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/terms/active", headers=headers)
        
        assert response.status_code == 200, f"Failed to get active term: {response.text}"
        data = response.json()
        assert "name" in data
        print(f"✓ Student can view active term: {data['name']}")
    
    def test_close_term_requires_admin(self, student_auth):
        """Test that closing term requires admin role"""
        token, _ = student_auth
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{BASE_URL}/api/terms/close-and-start-new", 
                                headers=headers,
                                json={"name": "Test Term"})
        
        assert response.status_code == 403, "Non-admin should not be able to close term"
        print("✓ Term closure correctly restricted to admin only")
    
    def test_close_term_requires_name(self, admin_token):
        """Test that closing term requires a name for new term"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test with empty name
        response = requests.post(f"{BASE_URL}/api/terms/close-and-start-new", 
                                headers=headers,
                                json={"name": ""})
        
        assert response.status_code == 400, "Should reject empty term name"
        print("✓ Empty term name correctly rejected")
        
        # Test with whitespace only
        response = requests.post(f"{BASE_URL}/api/terms/close-and-start-new", 
                                headers=headers,
                                json={"name": "   "})
        
        assert response.status_code == 400, "Should reject whitespace-only term name"
        print("✓ Whitespace-only term name correctly rejected")
    
    def test_close_term_and_start_new(self, admin_token):
        """Test POST /api/terms/close-and-start-new - Full flow"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current active term first
        response = requests.get(f"{BASE_URL}/api/terms/active", headers=headers)
        assert response.status_code == 200
        old_term = response.json()
        old_term_name = old_term.get("name", "Unknown")
        
        # Create new term with unique name
        new_term_name = f"Test Term {uuid.uuid4().hex[:8]}"
        
        response = requests.post(f"{BASE_URL}/api/terms/close-and-start-new", 
                                headers=headers,
                                json={"name": new_term_name})
        
        assert response.status_code == 200, f"Failed to close term: {response.text}"
        data = response.json()
        
        # Verify response
        assert "message" in data, "Response should contain message"
        print(f"✓ Term closed successfully: {data.get('message')}")
        
        # Verify new term is now active
        response = requests.get(f"{BASE_URL}/api/terms/active", headers=headers)
        assert response.status_code == 200
        new_active_term = response.json()
        
        assert new_active_term["name"] == new_term_name, "New term should be active"
        assert new_active_term["is_active"] == True
        
        print(f"✓ New term '{new_term_name}' is now active")
        print(f"  Previous term was: {old_term_name}")


class TestStudentStatistics:
    """Student statistics API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin authentication failed")
        return response.json()["token"]
    
    @pytest.fixture
    def student_auth(self):
        """Get student authentication token and ID"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Student authentication failed")
        data = response.json()
        return data["token"], data["user"]["id"]
    
    def test_get_student_statistics_own(self, student_auth):
        """Test student can get their own statistics"""
        token, student_id = student_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/statistics/student/{student_id}", headers=headers)
        
        assert response.status_code == 200, f"Failed to get statistics: {response.text}"
        data = response.json()
        
        # Verify response structure - all required fields
        assert "student" in data, "Response should contain 'student'"
        assert "memorization" in data, "Response should contain 'memorization'"
        assert "tracking" in data, "Response should contain 'tracking'"
        assert "recitation" in data, "Response should contain 'recitation'"
        assert "attendance" in data, "Response should contain 'attendance'"
        assert "total_points" in data, "Response should contain 'total_points'"
        
        # Verify tracking structure - sheets_count
        tracking = data["tracking"]
        assert "sheets_count" in tracking, "Tracking should contain 'sheets_count'"
        print(f"✓ Tracking sheets_count: {tracking['sheets_count']}")
        
        # Verify recitation structure - recitations_count
        recitation = data["recitation"]
        assert "recitations_count" in recitation, "Recitation should contain 'recitations_count'"
        print(f"✓ Recitations count: {recitation['recitations_count']}")
        
        # Verify attendance structure - percentage
        attendance = data["attendance"]
        assert "present" in attendance, "Attendance should contain 'present'"
        assert "absent" in attendance, "Attendance should contain 'absent'"
        assert "percentage" in attendance, "Attendance should contain 'percentage'"
        print(f"✓ Attendance - Present: {attendance['present']}, Absent: {attendance['absent']}, Percentage: {attendance['percentage']}%")
        
        # Verify total_points
        assert isinstance(data["total_points"], (int, float)), "total_points should be numeric"
        print(f"✓ Total points: {data['total_points']}")
        
        print("✓ Student statistics structure verified")
        return data
    
    def test_get_student_statistics_as_admin(self, admin_token, student_auth):
        """Test admin can get any student's statistics"""
        _, student_id = student_auth
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/statistics/student/{student_id}", headers=headers)
        
        assert response.status_code == 200, f"Admin failed to get student statistics: {response.text}"
        data = response.json()
        
        # Verify all required fields are present
        assert "student" in data
        assert "tracking" in data
        assert "recitation" in data
        assert "attendance" in data
        assert "total_points" in data
        
        print(f"✓ Admin can view student statistics")
        print(f"  Student: {data['student'].get('name', 'Unknown')}")
        print(f"  Total Points: {data['total_points']}")
    
    def test_student_cannot_view_other_statistics(self, student_auth):
        """Test student cannot view other student's statistics"""
        token, _ = student_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        # Try to access a fake student ID
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/statistics/student/{fake_id}", headers=headers)
        
        # Should be 403 (forbidden) or 404 (not found)
        assert response.status_code in [403, 404], "Student should not access other's statistics"
        print("✓ Student correctly restricted from viewing other students' statistics")
    
    def test_statistics_data_types(self, student_auth):
        """Test that statistics data types are correct"""
        token, student_id = student_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/statistics/student/{student_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify data types
        assert isinstance(data["total_points"], (int, float)), "total_points should be numeric"
        
        tracking = data["tracking"]
        assert isinstance(tracking["sheets_count"], int), "sheets_count should be integer"
        
        recitation = data["recitation"]
        assert isinstance(recitation["recitations_count"], int), "recitations_count should be integer"
        
        attendance = data["attendance"]
        assert isinstance(attendance["present"], int), "present should be integer"
        assert isinstance(attendance["absent"], int), "absent should be integer"
        assert isinstance(attendance["percentage"], (int, float)), "percentage should be numeric"
        
        print("✓ All statistics data types are correct")


class TestAdminDashboard:
    """Admin dashboard API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin authentication failed")
        return response.json()["token"]
    
    def test_admin_dashboard_stats(self, admin_token):
        """Test admin dashboard statistics endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/admin/dashboard-stats", headers=headers)
        
        assert response.status_code == 200, f"Failed to get dashboard stats: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "summary" in data, "Response should contain 'summary'"
        
        summary = data["summary"]
        assert "total_students" in summary, "Summary should contain 'total_students'"
        assert "total_sheikhs" in summary, "Summary should contain 'total_sheikhs'"
        assert "total_groups" in summary, "Summary should contain 'total_groups'"
        
        print(f"✓ Admin dashboard stats retrieved")
        print(f"  Total Students: {summary.get('total_students', 0)}")
        print(f"  Total Sheikhs: {summary.get('total_sheikhs', 0)}")
        print(f"  Total Groups: {summary.get('total_groups', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
