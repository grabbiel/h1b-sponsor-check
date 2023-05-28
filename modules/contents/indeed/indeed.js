class IndeedWorker extends GeneralParsingWorker{ // extend parent
    constructor(){
        super();
    }
    set_method(){
        parsing = true;
        this.documentbody = document.body;
        this.#determine_page();
    }
    #determine_page(){
        if(this.documentbody.querySelector(".jobsearch-JobCountAndSortPane-jobCountInfo")){
            this.jobposting = new IndeedSearchPage(this.documentbody);
            this.searchresults = new IndeedPostingsListing(this.documentbody);
        }
        else if(
            this.documentbody.querySelector("#cmp-JobSearchInput-cmp-JobsHeader-what") ||
            this.documentbody.querySelector("[data-testid='cmp-JobSearchInput']") || 
            this.documentbody.querySelector("[action^='/cmp/']") ||
            this.documentbody.querySelector("[for='cmp-JobSearchInput-cmp-JobsHeader-what']") ||
            this.documentbody.querySelector("[data-tn-element='NonIAApplyButton']")
        ){
            this.clear_search_cache();
            this.jobposting = new IndeedCompanyPage(this.documentbody);
        }
            
    }

}