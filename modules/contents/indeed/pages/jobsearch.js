class IndeedSearchPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.body = documentbody;
        if(this.#main_pane(this.body)){
            this.full_parsing();
        }
    }
    full_parsing(){
        var ans = this.body.querySelector("[class*='jobsearch-viewjoblayout']");
        this.mainpane = ans.querySelector(".jobsearch-JobComponent");
        this.#top_pane(this.mainpane);
        this.#position_placeholder(this.toppane);
        this.#job_description(this.mainpane).then(()=>{
            new Messaging({origin: "content", operation: "submit", data:{
                description: true,
                content: this.getDescription()
            }});
        });
        this.#name_placeholder(this.toppane).then(()=>{
            this.getName().then(()=>{
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.cname
        }})})});
    }
    #main_pane(){
        var ans = this.body.querySelector("[class*='jobsearch-viewjoblayout']");
        if(ans === null || ans === undefined){
            this.#emergency_main_pane();
            return false;
        }
        else{
            this.mainpane = ans.querySelector(".jobsearch-JobComponent");
            return true;
        }
    }
    #emergency_main_pane = async()=>{
        this.cname = this.body.querySelector(".companyName").innerText.trim();
        new Messaging({origin: "content", operation: "NULL", data:{
            name: true,
            content: this.cname}
        });
    }
    #top_pane(mainpane){
        this.toppane = mainpane.querySelector(".jobsearch-JobComponent-embeddedHeader");
    }
    #position_placeholder(toppane){
        this.positionholder = toppane.querySelector(".jobsearch-JobInfoHeader-title > span");
    }
    #job_description = async(mainpane) =>{
        this.descriptionholder = mainpane.querySelector("#jobDescriptionText");
    }
    #name_placeholder = async(toppane) =>{
        this.nameholder = toppane.querySelector("[data-company-name='true']");
    }

}