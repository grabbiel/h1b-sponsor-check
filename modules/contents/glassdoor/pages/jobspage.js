class GlassdoorJobsPage extends PageManipulation{
    constructor(documentbody){
        super();
        this.body = documentbody;
        this.#name_placeholder().then(()=>{
            this.getName().then(()=>{
                console.log(this.cname);
                new Messaging({origin: "content", operation: "submit", data:{
                    name: true,
                    content: this.cname
        }})})});
    }
    #name_placeholder = async() =>{
        this.nameholder = this.body.querySelector(".employerName");
    }
}