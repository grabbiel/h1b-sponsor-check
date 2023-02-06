import ServerRequest from "./main.js";
export default class Requests extends ServerRequest{
    constructor(){
        super();
        this.json_temp = null;
        this.string_temp = null;
    }
    findCompanyMatch = async(job_board_company) =>{
        await this.setRequest("names/company_matching")
        await this.setFormData({key: "companyname", value: job_board_company});
        let out = await this.runQuery();
        if(out!=undefined && this.json_response==null){
            this.json_temp = out;
            this.string_temp = job_board_company;
        }
    }
    submitCompanyMatch = async(uscis_name, job_board_id, name_match) =>{

    }
    getCompanyRecord = async(job_board_company) =>{
        await this.setRequest("h1brecords/requests_and_ranking");
        await this.setFormData({key:"companyname", value: job_board_company});
        let out = await this.runQuery();
        if(out!=undefined){
            this.json_temp = out;
            return;
        }else{
            new Error("[]: "); //detail
        }
    }
    clearCache(){
        this.json_temp = null;
        this.string_temp = null;
    }
}