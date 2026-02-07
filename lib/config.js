/**
 * Smartsheet Dashboard Configuration
 * 
 * UPDATE THESE VALUES after running the discovery endpoint (/api/discover)
 * to match your actual Smartsheet column names.
 */

const config = {
  // Your Smartsheet report or sheet ID
  // Run /api/discover first to find this
  sourceId: process.env.SMARTSHEET_SOURCE_ID || "",
  sourceType: process.env.SMARTSHEET_SOURCE_TYPE || "report", // "report" or "sheet"

  // Map your Smartsheet column names to dashboard fields
  // The keys are the dashboard fields, values are YOUR column names in Smartsheet
  columnMapping: {
    project_name: process.env.COL_PROJECT_NAME || "Project Name",
    client_name: process.env.COL_CLIENT_NAME || "Client",
    status: process.env.COL_STATUS || "Status",
    project_manager: process.env.COL_PROJECT_MANAGER || "Project Manager",
    budget_allocated: process.env.COL_BUDGET_ALLOCATED || "Budget",
    budget_spent: process.env.COL_BUDGET_SPENT || "Actuals",
    percent_complete: process.env.COL_PERCENT_COMPLETE || "% Complete",
    start_date: process.env.COL_START_DATE || "Start Date",
    end_date: process.env.COL_END_DATE || "End Date",
    project_type: process.env.COL_PROJECT_TYPE || "Service Type",
  },

  // Which status values map to green / yellow / red
  // Adjust these to match your Smartsheet dropdown options
  statusValues: {
    green: ["Green", "On Track", "Complete", "Completed"],
    yellow: ["Yellow", "At Risk", "Caution", "In Progress"],
    red: ["Red", "Off Track", "Blocked", "Overdue", "Late"],
  },

  title: process.env.DASHBOARD_TITLE || "Antenna Group — Weekly Project Snapshot",
};

module.exports = config;
