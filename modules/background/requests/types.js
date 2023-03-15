import ServerRequest from "./main.js";
export default class Requests extends ServerRequest{

    constructor(){
        super();
    }
    /**
     * Call MySQL function checking if company has sponsoring history
     * @param String company_name
     * @returns int
    */
    findCompanyMatch = async(company_name) =>{
        this.setRequest("h1brecords/company_has_match");
        this.setFormData({key: "companyname", value: company_name});
        return this.runQuery().then(
            (response)=>{ return response.cstatus; }
        );
    }
    /**
     * Call prepared statement containing historical sponsoring data for the company
     * @param String company_name
     * @returns Object <int, int, int>
    */
    getCompanyRecord = async(company_name) =>{
        this.setRequest("h1brecords/get_company_record");
        this.setFormData({key:"companyname", value: company_name});
        return this.runQuery().then(
            (response)=>{
                return response;
            }
        );
    }
}