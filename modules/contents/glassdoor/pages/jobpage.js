class GlassdoorJobPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.body = documentbody;
        this.#postion_placeholder();
        this.#job_description();
        this.#name_placeholder();
    }
    #postion_placeholder(){
        this.positionholder = this.body.querySelectorAll("[data-test = 'jobTitle']")[1];
        this.positionholder.style.display = "flex";
        console.log(this.positionholder);
    }
    #job_description = async() =>{

    }
    #name_placeholder = async() =>{
        
    }
}