class IndeedCompanyPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.body = documentbody;
        this.#position_placeholder();
        this.#job_description().then(()=>{
            new Messaging({origin: "content", operation: "submit", data: {
                description: true,
                content: this.getDescription()
        }})});
        this.#name_placeholder().then(()=>{
            this.getName().then(()=>{
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.cname
        }})})});
    }
    #position_placeholder(){
        this.positionholder = this.body.querySelector("[data-testid = 'jobDetailTitle'] > span");
        this.positionholder.style.display = "flex";
    }
    #job_description = async() =>{
        this.descriptionholder = this.body.querySelector(".JobDetailDescriptionScrollable");
    }
    #name_placeholder = async() =>{
        this.nameholder = this.body.querySelector("[itemprop = 'name']");
        this.nameholder.style.display = "flex";
    }

}   