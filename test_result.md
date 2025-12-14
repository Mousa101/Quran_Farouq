#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  تطبيق مركز الفاروق القرآني لتحفيظ القرآن - المطلوب:
  1. صفحة ملف شخصي مفصلة للطالب (يصل إليها المعلم بالنقر على اسم الطالب)
  2. صلاحية إضافة/حذف/نقل الطلاب للمدير فقط
  3. نظام إنذارات للمدير (غياب متكرر، عدم التسميع، سلوك سلبي)

backend:
  - task: "Student Profile API"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/students/{student_id}/profile - returns student info, group, points, badges, attendance summary, recitation summary, warnings"

  - task: "Add Student (Admin Only)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/admin/students - admin-only endpoint to create students"

  - task: "Delete Student (Admin Only)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "DELETE /api/students/{student_id} - admin-only endpoint to delete students"

  - task: "Change Student Group (Admin Only)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/students/{student_id}/change-group - admin-only endpoint to change group"

  - task: "Warning System API"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/admin/warnings - issue warnings. GET /api/admin/warnings - list all. DELETE /api/admin/warnings/{id} - delete"

frontend:
  - task: "Student Profile Page"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/StudentProfile.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Complete student profile with personal info, points, badges, attendance/recitation summary, warnings, and tabs for detailed records"

  - task: "Student Management Page (Admin)"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/StudentManagement.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Admin page with add/delete/change group/issue warning functionality"

  - task: "Clickable Student Names (Sheikh Dashboard)"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/SheikhDashboard.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added 'My Students' section with clickable links to student profiles"

  - task: "Clickable Student Names (Users Page)"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/UsersPage.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Student names are clickable for admin/sheikh to view profiles"

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Student Profile Page"
    - "Student Management Page (Admin)"
    - "Warning System API"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Implemented student profile and management features:
      1. Created StudentProfile.jsx - shows complete student info with personal details, points, badges, attendance/recitation summaries, warnings, and detailed record tabs
      2. Created StudentManagement.jsx - admin-only page for adding/deleting/moving students and issuing warnings
      3. Added warning system backend with POST/GET/DELETE endpoints
      4. Updated UsersPage and SheikhDashboard to have clickable student names
      
      Test credentials:
      - Admin: testadmin@test.com / 123456
      - Sheikh: testsheikh@test.com / 123456
      - Student: teststudent@test.com / 123456
      
      Test scenarios:
      1. Login as admin → Navigate to إدارة الطلاب → View student profiles
      2. Add a new student via the dialog
      3. Issue a warning to a student
      4. Change student group
      5. Delete a student
      6. Login as sheikh → View students in dashboard → Click to see profiles