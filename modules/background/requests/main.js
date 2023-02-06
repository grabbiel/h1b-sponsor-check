export default class ServerRequest{
    constructor(){
        this.initialRoute = "http://ec2-3-23-131-242.us-east-2.compute.amazonaws.com/phpdocs/";
        this.fullRoute = null;
        this.formData = new FormData();
    }
    async setRequest(requestType){
        this.fullRoute = this.initialRoute+requestType+".php";
        return;
    }
    runQuery = async () => {
        let fetchResult = await fetch(this.fullRoute, {method: "POST", body: this.formData});
        let jsonResponse = await fetchResult.json();
        this.formData = new FormData();
        return jsonResponse;
    }
    async setFormData(...keyvals){
        for(const keyval of keyvals){
            this.formData.append(keyval.key, keyval.value);
        }
        return;
    }
}