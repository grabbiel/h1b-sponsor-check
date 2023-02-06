class ViewPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.main_pane(documentbody);
        this.top_pane(this.mainpane);
        this.position_placeholder(this.toppane);
        this.job_description(this.mainpane).finally(()=>{
            this.cdescription = this.getDescription();
            new Messaging({origin: "content", operation: "submit", data:{
                description: true,
                content: this.cdescription
            }});
        });
        this.name_placeholder(this.toppane).finally(()=>{
            this.getName().finally(()=>{
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.cname}
                });
            });
        });                
    }
    main_pane(htmlbody){
        this.mainpane =  htmlbody.querySelector("[role='main']");
    }
    job_description = async(mainpane) =>{
        this.descriptionholder = mainpane.querySelector("[class*='jobs-description'] > article > div > [class*='content'] > span");
    }
    top_pane(mainpane){
        this.toppane =  mainpane.querySelector("div:not([class]) > div > div > .p5");
    }
    name_placeholder = async(toppane) =>{
        this.nameholder =  toppane.querySelector("[class*='company-name'] > a");
    }
    position_placeholder(toppane){
        this.placeholder = toppane.querySelector("h1");
        this.positionholder = this.placeholder;
    }
}