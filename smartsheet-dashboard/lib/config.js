/**
 * Smartsheet Dashboard Configuration
 * Full column mapping for the ALL PROJECTS LIST report
 */

const config = {
  sourceId: process.env.SMARTSHEET_SOURCE_ID || "",
  sourceType: process.env.SMARTSHEET_SOURCE_TYPE || "report",

  columnMapping: {
    rid: process.env.COL_RID || "RID",
    top_priority: process.env.COL_TOP_PRIORITY || "Top Priority",
    client_name: process.env.COL_CLIENT_NAME || "Client",
    project_name: process.env.COL_PROJECT_NAME || "Assignment Title",
    workflow_status: process.env.COL_WORKFLOW_STATUS || "Workflow Status",
    request_type: process.env.COL_REQUEST_TYPE || "Request Type",
    budget_forecast: process.env.COL_BUDGET_ALLOCATED || "Budget Forecast",
    actuals: process.env.COL_BUDGET_SPENT || "Actuals",
    oop: process.env.COL_OOP || "OOP",
    overage: process.env.COL_OVERAGE || "Overage",
    rag: process.env.COL_STATUS || "RAG",
    has_pm: process.env.COL_HAS_PM || "PM?",
    work_progress: process.env.COL_WORK_PROGRESS || "Work Progress",
    percent_complete: process.env.COL_PERCENT_COMPLETE || "% Complete",
    last_weeks_deviation: process.env.COL_LAST_WEEKS_DEVIATION || "Last Weeks Deviation",
    approved_investment: process.env.COL_APPROVED_INVESTMENT || "Approved Investment Total",
    missing_time: process.env.COL_MISSING_TIME || "MISSING TIME",
    project_manager: process.env.COL_PROJECT_MANAGER || "PM/PROD Assigned",
    resource_status: process.env.COL_RESOURCE_STATUS || "Resource Status",
    ecosystem: process.env.COL_ECOSYSTEM || "Owning Ecosystem",
    creative_retainer: process.env.COL_CREATIVE_RETAINER || "Creative Retainer",
    win_probability: process.env.COL_WIN_PROBABILITY || "Win Probability",
    investment_forecast: process.env.COL_INVESTMENT_FORECAST || "Investment Forecast",
    assignment: process.env.COL_ASSIGNMENT || "Assignment",
    recommendation: process.env.COL_RECOMMENDATION || "RECOMMENDATION",
    monthly_baseline: process.env.COL_MONTHLY_BASELINE || "Monthly Baseline Budget",
    monthly_budget: process.env.COL_MONTHLY_BUDGET || "Monthly Budget",
    time_and_materials: process.env.COL_TM || "T&M",
    weighted_pipeline: process.env.COL_WEIGHTED_PIPELINE || "Weighted Pipeline Value",
  },

  statusValues: {
    green: ["Green"],
    yellow: ["Yellow"],
    red: ["Red"],
  },

  workflowPhases: {
    active: ["Active", "In Progress"],
    pipeline: ["Proposal", "Prospect", "Pending"],
    on_hold: ["On Hold", "Paused"],
    closed: ["Closed", "Complete", "Completed", "Cancelled", "Lost"],
  },

  title: process.env.DASHBOARD_TITLE || "Antenna Group — Weekly Project Snapshot",
};

module.exports = config;
