class IndeedSearchPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.body = documentbody;

        if(this.#mainPane(this.body)){
            this.#topPane(this.mainpane);
            this.#positionPlaceholder(this.toppane);
            this.#jobDescription(this.mainpane).then(()=>{

                new Messaging({origin: "content", operation: "submit", data:{
                    description: true,
                    content: this.getDescription()
                }});
            });
            this.#namePlaceholder(this.toppane).then(()=>{
                this.getName().then(()=>{
                    
                    new Messaging({origin: "content", operation: "submit", data:{
                        name: true,
                        content: this.cname
            }})})});
        }
    }
    /**
     * Check whether main posting pane is visible upon parsing request from background script.
     * @param void
     * @returns Boolean
    */
    #mainPane(){
        var ans = this.body.querySelector(".jobsearch-ViewJobLayout-jobDisplay");
        if(ans === null || ans === undefined){ 
            this.#emergencyMainPane();
            return false;
        }
        else{ 
            this.mainpane = ans.querySelector(".jobsearch-JobComponent");
            return true;
        };
    }
    /**
     * Stores company name by parsing listing search pane. Called when main posting pane is not loaded upon parsing request.
     * @param void
     * @returns void
    */
    #emergencyMainPane = async()=>{
        this.cname = this.body.querySelector(".companyName").innerText.trim();
        new Messaging({origin: "content", operation: "NULL", data:{
            name: true,
            content: this.cname}
        });
    }
    /**
     * Store top pane from main posting pane.
     * @param HTMLDivElement main_pane
     * @returns void
    */
    #topPane(mainpane){
        this.toppane = mainpane.querySelector(".jobsearch-JobComponent-embeddedHeader");
    }
    /**
     * Store job title container from top posting pane.
     * @param HTMLDivElement top_pane
     * @returns void
    */
    #positionPlaceholder(toppane){
        this.positionholder = toppane.querySelector(".jobsearch-JobInfoHeader-title > span");
    }
    /**
     * Store job description container from main posting pane.
     * @param HTMLDivElement main_pane
     * @returns void
    */
    #jobDescription = async(mainpane) =>{
        this.descriptionholder = mainpane.querySelector("#jobDescriptionText");
    }
    /**
     * Store company name's container from top posting pane.
     * @param HTMLDivElement top_pane
     * @returns void
    */
    #namePlaceholder = async(toppane) =>{
        this.nameholder = toppane.querySelector("[data-company-name='true']");
    }

}