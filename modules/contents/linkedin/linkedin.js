class LinkedinWorker extends GeneralParsingWorker{ // extend parent
    constructor(){
        super();
    }
    set_method(){
        this.documentbody = document.body;
        this.#determine_page();
    }
    #determine_page(){
        if(this.documentbody.querySelector(".jobs-search-results__list-item"))
            this.#determine_browsing_page();
        else this.#check_for_job_view();
    }
    #determine_browsing_page(){
        if(this.documentbody.querySelector("[title='Jobs based on your profile']")){
            this.searchresults = new LinkedinPostingsListing(this.documentbody, 1);
            this.jobposting = new LinkedinRecommendedPage(this.documentbody);
            if(Boolean(this.jobposting.cname) === false || this.jobposting.cname === ""){
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.get_listing_active_company_name()
                }});
            }
        }else{
            this.searchresults = new LinkedinPostingsListing(this.documentbody, 0);
            this.jobposting = new LinkedinSearchPage(this.documentbody);
        }
    }
    #check_for_job_view(){
        if(this.documentbody.querySelector(".jobs-unified-top-card__job-title")){
            this.clear_search_cache();
            this.jobposting = new LinkedinViewPage(this.documentbody);
        }            
    }
 
}