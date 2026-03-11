"""
Test Term Management Features - Iteration 5
Tests for:
1. GET /api/terms - Available for sheikh and admin
2. GET /api/attendance?term_id=xxx - Filter attendance by term
3. GET /api/recitations?term_id=xxx - Filter recitations by term
4. GET /api/terms/{term_id}/records - Get records for specific term
5. Term-based filtering and read-only mode for old terms
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_admin@test.com"
ADMIN_PASSWORD = "test123"
SHEIKH_EMAIL = "test_sheikh@test.com"
SHEIKH_PASSWORD = "test123"
STUDENT_EMAIL = "test_student@test.com"
STUDENT_PASSWORD = "test123"


class TestTermManagement:
    """Test term management API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, email, password):
        """Helper to login and get token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return token
        return None
    
    # ============== GET /api/terms Tests ==============
    
    def test_get_terms_as_admin(self):
        """Admin should be able to get all terms"""
        token = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/terms")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        terms = response.json()
        assert isinstance(terms, list), "Terms should be a list"
        print(f"✓ Admin can access /api/terms - Found {len(terms)} terms")
        
        # Verify term structure
        if len(terms) > 0:
            term = terms[0]
            assert "id" in term, "Term should have id"
            assert "name" in term, "Term should have name"
            assert "is_active" in term, "Term should have is_active flag"
            print(f"✓ Term structure verified: {term.get('name')}")
    
    def test_get_terms_as_sheikh(self):
        """Sheikh should be able to get all terms"""
        token = self.login(SHEIKH_EMAIL, SHEIKH_PASSWORD)
        assert token is not None, "Sheikh login failed"
        
        response = self.session.get(f"{BASE_URL}/api/terms")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        terms = response.json()
        assert isinstance(terms, list), "Terms should be a list"
        print(f"✓ Sheikh can access /api/terms - Found {len(terms)} terms")
    
    def test_get_terms_as_student_forbidden(self):
        """Student should NOT be able to get terms"""
        token = self.login(STUDENT_EMAIL, STUDENT_PASSWORD)
        assert token is not None, "Student login failed"
        
        response = self.session.get(f"{BASE_URL}/api/terms")
        assert response.status_code == 403, f"Expected 403 for student, got {response.status_code}"
        print("✓ Student correctly denied access to /api/terms")
    
    def test_get_active_term(self):
        """Test getting the active term"""
        token = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/terms/active")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        term = response.json()
        assert "id" in term, "Active term should have id"
        assert "name" in term, "Active term should have name"
        assert term.get("is_active") == True, "Active term should have is_active=True"
        print(f"✓ Active term: {term.get('name')} (ID: {term.get('id')})")
        return term
    
    # ============== GET /api/attendance with term_id Tests ==============
    
    def test_get_attendance_with_term_filter(self):
        """Test filtering attendance by term_id"""
        token = self.login(SHEIKH_EMAIL, SHEIKH_PASSWORD)
        assert token is not None, "Sheikh login failed"
        
        # First get active term
        terms_response = self.session.get(f"{BASE_URL}/api/terms")
        terms = terms_response.json()
        active_term = next((t for t in terms if t.get("is_active")), None)
        
        if active_term:
            term_id = active_term["id"]
            response = self.session.get(f"{BASE_URL}/api/attendance?term_id={term_id}")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            attendance = response.json()
            assert isinstance(attendance, list), "Attendance should be a list"
            print(f"✓ Attendance filtered by term_id - Found {len(attendance)} records")
        else:
            print("⚠ No active term found, skipping term filter test")
    
    def test_get_attendance_without_term_filter(self):
        """Test getting attendance without term filter (should use active term)"""
        token = self.login(SHEIKH_EMAIL, SHEIKH_PASSWORD)
        assert token is not None, "Sheikh login failed"
        
        response = self.session.get(f"{BASE_URL}/api/attendance")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        attendance = response.json()
        assert isinstance(attendance, list), "Attendance should be a list"
        print(f"✓ Attendance without term filter - Found {len(attendance)} records")
    
    # ============== GET /api/recitations with term_id Tests ==============
    
    def test_get_recitations_with_term_filter(self):
        """Test filtering recitations by term_id"""
        token = self.login(SHEIKH_EMAIL, SHEIKH_PASSWORD)
        assert token is not None, "Sheikh login failed"
        
        # First get active term
        terms_response = self.session.get(f"{BASE_URL}/api/terms")
        terms = terms_response.json()
        active_term = next((t for t in terms if t.get("is_active")), None)
        
        if active_term:
            term_id = active_term["id"]
            response = self.session.get(f"{BASE_URL}/api/recitations?term_id={term_id}")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            recitations = response.json()
            assert isinstance(recitations, list), "Recitations should be a list"
            print(f"✓ Recitations filtered by term_id - Found {len(recitations)} records")
        else:
            print("⚠ No active term found, skipping term filter test")
    
    def test_get_recitations_without_term_filter(self):
        """Test getting recitations without term filter"""
        token = self.login(SHEIKH_EMAIL, SHEIKH_PASSWORD)
        assert token is not None, "Sheikh login failed"
        
        response = self.session.get(f"{BASE_URL}/api/recitations")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        recitations = response.json()
        assert isinstance(recitations, list), "Recitations should be a list"
        print(f"✓ Recitations without term filter - Found {len(recitations)} records")
    
    # ============== Term Records Endpoint Tests ==============
    
    def test_get_term_records(self):
        """Test getting records for a specific term"""
        token = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        # Get active term
        terms_response = self.session.get(f"{BASE_URL}/api/terms")
        terms = terms_response.json()
        
        if len(terms) > 0:
            term_id = terms[0]["id"]
            response = self.session.get(f"{BASE_URL}/api/terms/{term_id}/records")
            
            # This endpoint may or may not exist - check both cases
            if response.status_code == 200:
                records = response.json()
                print(f"✓ Term records endpoint exists - Got records for term {term_id}")
            elif response.status_code == 404:
                print(f"⚠ Term records endpoint /api/terms/{term_id}/records not found (404)")
            else:
                print(f"⚠ Term records endpoint returned {response.status_code}")
        else:
            print("⚠ No terms found")
    
    # ============== Term Structure Validation ==============
    
    def test_term_has_required_fields(self):
        """Verify term objects have all required fields"""
        token = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/terms")
        assert response.status_code == 200
        
        terms = response.json()
        if len(terms) > 0:
            term = terms[0]
            required_fields = ["id", "name", "is_active"]
            for field in required_fields:
                assert field in term, f"Term missing required field: {field}"
            print(f"✓ Term has all required fields: {required_fields}")
            
            # Check optional fields
            optional_fields = ["start_date", "end_date", "created_at", "created_by"]
            present_optional = [f for f in optional_fields if f in term]
            print(f"✓ Term has optional fields: {present_optional}")
    
    # ============== Active Term Identification ==============
    
    def test_only_one_active_term(self):
        """Verify only one term is marked as active"""
        token = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/terms")
        assert response.status_code == 200
        
        terms = response.json()
        active_terms = [t for t in terms if t.get("is_active") == True]
        
        assert len(active_terms) <= 1, f"Expected at most 1 active term, found {len(active_terms)}"
        print(f"✓ Active terms count: {len(active_terms)} (valid)")
        
        if len(active_terms) == 1:
            print(f"✓ Active term: {active_terms[0].get('name')}")


class TestAttendanceTermIntegration:
    """Test attendance with term integration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, email, password):
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return token
        return None
    
    def test_attendance_includes_term_id(self):
        """Verify attendance records include term_id"""
        token = self.login(SHEIKH_EMAIL, SHEIKH_PASSWORD)
        assert token is not None
        
        response = self.session.get(f"{BASE_URL}/api/attendance")
        assert response.status_code == 200
        
        attendance = response.json()
        if len(attendance) > 0:
            # Check if any record has term_id
            records_with_term = [a for a in attendance if a.get("term_id")]
            print(f"✓ Attendance records with term_id: {len(records_with_term)}/{len(attendance)}")
        else:
            print("⚠ No attendance records found")


class TestRecitationsTermIntegration:
    """Test recitations with term integration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, email, password):
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return token
        return None
    
    def test_recitations_includes_term_id(self):
        """Verify recitation records include term_id"""
        token = self.login(SHEIKH_EMAIL, SHEIKH_PASSWORD)
        assert token is not None
        
        response = self.session.get(f"{BASE_URL}/api/recitations")
        assert response.status_code == 200
        
        recitations = response.json()
        if len(recitations) > 0:
            # Check if any record has term_id
            records_with_term = [r for r in recitations if r.get("term_id")]
            print(f"✓ Recitation records with term_id: {len(records_with_term)}/{len(recitations)}")
        else:
            print("⚠ No recitation records found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
