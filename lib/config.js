/**
 * Smartsheet Dashboard Configuration
 */

const config = {
  sourceId: process.env.SMARTSHEET_SOURCE_ID || "",
  sourceType: process.env.SMARTSHEET_SOURCE_TYPE || "report",

  columnMapping: {
    rid: "RID",
    top_priority: "Top Priority",
    client_name: "Client",
    project_name: "Assignment Title",
    workflow_status: "Workflow Status",
    request_type: "Request Type",
    budget_forecast: "Budget Forecast",
    actuals: "Actuals",
    oop: "OOP",
    overage: "Overage",
    rag: "RAG",
    has_pm: "PM?",
    work_progress: "Work Progress",
    percent_complete: "% Complete",
    last_weeks_deviation: "Last Weeks Deviation",
    approved_investment: "Approved Investment Total",
    missing_time: "MISSING TIME",
    project_manager: "PM/PROD Assigned",
    resource_status: "Resource Status",
    ecosystem: "Owning Ecosystem",
    creative_retainer: "Creative Retainer",
    win_probability: "Win Probability",
    investment_forecast: "Investment Forecast",
    assignment: "Assignment",
    recommendation: "RECOMMENDATION",
    monthly_baseline: "Monthly Baseline Budget",
    monthly_budget: "Monthly Budget",
    time_and_materials: "T&M",
    weighted_pipeline: "Weighted Pipeline Value",
    fit: "FIT",
  },

  statusValues: {
    green: ["Green"],
    yellow: ["Yellow"],
    red: ["Red"],
    blue: ["Blue"],
  },

  categories: {
    "Internal Admin Time": { workflowStatuses: ["aActive Admin"], segment: "internal" },
    "Internal Approved Projects": { workflowStatuses: ["aActive Internal"], segment: "internal" },
    "Active Live Projects": { workflowStatuses: ["Active Climate", "Active Health", "Active PA", "Active Real Estate", "Active HOWL"], segment: "live" },
    "Active Support": { workflowStatuses: ["Active Support"], segment: "live" },
    "Active Web Warranty": { workflowStatuses: ["Active Web Warranty"], segment: "live" },
    "New Business Qualification": { sheetNames: ["NEW BIZ QUALIFICATION"], segment: "newbiz" },
    "New Business Pipeline": { sheetNames: ["PIPELINE SHEET"], segment: "newbiz" },
  },

  // Billable ecosystems for executive reporting (exclude internal, support, web)
  billableEcosystems: ["Climate", "Real Estate", "Health", "Public Affairs", "HOWL"],

  pipelineStages: ["IN REVIEW", "Proposal", "Waiting For Response", "Working On Contract", "On Hold"],

  // Pipeline stage display order for table sorting
  pipelineStageOrder: ["Proposal", "Waiting For Response", "Working On Contract", "IN REVIEW", "On Hold"],

  // Stage display name overrides
  stageDisplayNames: { "IN REVIEW": "In Qualification" },

  title: process.env.DASHBOARD_TITLE || "Antenna Group — All Projects Dashboard",
};

module.exports = config;
