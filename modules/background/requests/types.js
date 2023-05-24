import ServerRequest from "./main.js";
export default class Requests extends ServerRequest{

    constructor(){
        super();
    }
    findCompanyMatch = async(job_board_company) =>{
        this.setRequest("h1brecords/company_has_match");
        this.setFormData({key: "companyname", value: job_board_company});

        return this.runQuery().then(
            (response)=>{
                return response.cstatus;
            }
        );
    }
    getCompanyRecord = async(job_board_company) =>{
        this.setRequest("h1brecords/get_company_record");
        this.setFormData({key: "companyname", value: job_board_company});

        return this.runQuery().then(
            (response)=>{
                return response;
            }
        );
    }
    submitMatchReview = async(job_board_company, platform_code, country_code, string_literal) =>{
        this.setRequest("match_review/submit_match_review");
        
        this.formData.companyname = job_board_company;
        this.formData.platform = platform_code;
        this.formData.country = country_code;
        this.formData.stringliteral = string_literal;

        return this.runQuery().then(
            (response)=>{return response;}
        );
    }
}