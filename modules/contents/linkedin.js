class LinkedinWorker extends GeneralParsingWorker{ // extend parent
    constructor(){
        super();
    }
    /**
     * Initialize page parsing.
     * @param void
     * @return void
    */
    set_method(){
        this.documentbody = document.body;
        this.#determinePage();
    }
    /**
     * Re-routes parsing worker to the appropriate dom-manipulation methods, based on current path within LinkedIn
     * @param void
     * @returns void
    */
    #determinePage(){

        if(this.documentbody.querySelector(".jobs-search-results__list-item"))
            this.#determineBrowsingPage();

        else this.#checkForJobView();
    }
    /**
     * Re-routes parsing worker to the appropriate dom-manipulation methods specific to either the Recommended path or the Job Search path within LinkedIn
     * @param void
     * @returns void 
    */
    #determineBrowsingPage(){
        
        if(this.documentbody.querySelector("[title='Jobs based on your profile']")){
            // recommended page

            this.searchresults = new LinkedinPostingsListing(this.documentbody, 1);

            this.jobposting = new LinkedinRecommendedPage(this.documentbody);

            if(Boolean(this.jobposting.cname) === false || this.jobposting.cname === ""){
            // call in case first-time parsing fails: get name from listing array
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.getListingActiveCompanyName()
                }});
            
            }
        }else{ // search page

            this.searchresults = new LinkedinPostingsListing(this.documentbody, 0);
            this.jobposting = new LinkedinSearchPage(this.documentbody);

        }
    }
    /**
     * Checks whether the current path within LinkedIn corresponds to that of Job View, calling appropriate dom-manipulation methods
     * @param void
     * @returns void
    */
    #checkForJobView(){
        if(this.documentbody.querySelector(".jobs-unified-top-card__job-title")){
            this.clearSearchCache(); // delete listing object
            this.jobposting = new LinkedinViewPage(this.documentbody);
        }            
    }
 
}