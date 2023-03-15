/* ===== GENERAL PARSING WORKER VALIDATOR ===== */
function validateParsingWorker(parsing_worker_state, site_name){
    if(parsing_worker_state === false) return false;
    switch(site_name){
        case 1:
            return validateLinkedinWorker();
        case 2:
            return validateIndeedWorker();
        default:
            return false;
    }
}

/* ====== SITE-SPECIFIC PARSING WORKER VALIDATORS ====== */
/**
 * Check if user is in fact in LinkedIn.com
 * @param void
 * @returns boolean
*/
function validateLinkedinWorker(){
    if(document.body.querySelector("[aria-label='LinkedIn']") || document.getElementById("global-nav-typeahead"))
        return true;
    return false;
}
/**
 * Check if user is in fact in Indeed.com
 * @param void
 * @returns boolean
*/
function validateIndeedWorker(){
    if(document.getElementById("indeed-globalnav-logo") || document.body.querySelector("[aria-label='Indeed Home']"))
        return true;
    return false;
}