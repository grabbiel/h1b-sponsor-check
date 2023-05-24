/* ===== GENERAL PARSING WORKER VALIDATOR ===== */
function validate_parsing_worker(parsingWorkerState, siteName){
    if(parsingWorkerState === false) return false;
    switch(siteName){
        case 1:
            return validate_linkedin_worker();
        case 2:
            return validate_indeed_worker();
        case 3:
            return validate_glassdoor_worker();
        default:
            return false;
    }
}

/* ====== PARSING WORKER VALIDATORS ====== */
function validate_linkedin_worker(){
    if(document.body.querySelector("[aria-label='LinkedIn']") || document.getElementById("global-nav-typeahead"))
        return true;
    return false;
}
function validate_indeed_worker(){
    if(document.getElementById("indeed-globalnav-logo") || document.body.querySelector("[aria-label='Indeed Home']"))
        return true;
    return false;
}
function validate_glassdoor_worker(){
    if(document.body.querySelector("[data-test = 'header-glassdoor-logo']") || document.body.querySelector("[aria-label = 'Glassdoor Logo']") || document.body.querySelector(".siteHeader__HeaderStyles__brandLogoContainer"))
        return true;
    return false;
}