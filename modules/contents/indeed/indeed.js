class IndeedWorker extends GeneralParsingWorker{ // extend parent
    constructor(){
        super();
    }
    /**
     * Initialize page parsing.
     * @param void
     * @return void
    */
    set_method(){
        parsing = true;
        this.documentbody = document.body;
        this.#determinePage();
    }
    /**
     * Re-routes parsing worker to the appropriate dom-manipulation methods, based on current path within Indeed
     * @param void
     * @returns void
    */
    #determinePage(){
        if(this.documentbody.querySelector(".jobsearch-JobCountAndSortPane-jobCountInfo")){
            // general search page
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
            // company jobs search page
            this.clearSearchCache();
            this.jobposting = new IndeedCompanyPage(this.documentbody);
        }
            
    }

}