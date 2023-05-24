class GlassdoorWorker extends GeneralParsingWorker{
    constructor(){
        super();
    }
    set_method(){
        this.documentbody = document.body;
        this.#determine_page();
    }
    #determine_page(){
        console.log("Determining page");
        if(this.documentbody.querySelector("[data-test = 'ei-info-employer-logo']"))
            this.jobposting = new GlassdoorJobsPage(this.documentbody);
        else if(this.documentbody.querySelector("[data-test = 'employerLogo']")) 
            console.log("in job-listing section");
        else if(
            this.documentbody.querySelector("[data-test = 'sort-by-header']") ||
            this.documentbody.querySelector("[data-test = 'JOBTYPE']") ||
            this.documentbody.querySelector("#filter_jobType")
        )
            this.jobposting = new GlassdoorJobPage(this.documentbody);
    }
}