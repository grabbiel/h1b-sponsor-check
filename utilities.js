import PostingInformation from "./modules/background/posting.js";

export const posting = new PostingInformation();

/* ======== GENERAL CONTENT SCRIPTS ======== */
export const content_scripts = ["./modules/contents/operations/validation.js", 
"mainContent.js",
"./modules/contents/parsingWorker.js",
"./modules/badges/position.js",
"./modules/badges/company.js",
"./modules/popup/script/loading.js",
"./modules/popup/script/main.js",
"./modules/contents/messaging.js"];

/* ======== SITE-SPECIFIC CONTENT SCRIPTS ======== */
export const linkedin_content_scripts = ["./modules/contents/page.js",
"./modules/contents/linkedin/pages/jobsearch.js",
"./modules/contents/linkedin/pages/recommended.js",
"./modules/contents/linkedin/pages/jobview.js",
"./modules/contents/linkedin/listing.js",
"./modules/contents/linkedin/linkedin.js"
];

