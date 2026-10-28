import { defineConfig, devices } from "@playwright/test";
const base=(process.env.TEST_BASE_PATH??"").replace(/\/$/,"");
export default defineConfig({
  testDir:"./tests/browser",
  fullyParallel:false,
  workers:1,
  timeout:30_000,
  use:{baseURL:`http://127.0.0.1:3100${base}/`,trace:"retain-on-failure",screenshot:"only-on-failure",launchOptions:process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:undefined},
  projects:[
    {name:"desktop",use:{viewport:{width:1440,height:1050},timezoneId:"America/Los_Angeles"}},
    {name:"mobile",use:{...devices["iPhone 13"],defaultBrowserType:"chromium",timezoneId:"Asia/Tokyo"}},
  ],
  webServer:{command:"npm run build && PORT=3100 npm start",url:`http://127.0.0.1:3100${base}/`,reuseExistingServer:false,timeout:120_000,env:{NEXT_TELEMETRY_DISABLED:"1",NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"",PAGES_BASE_PATH:base}},
});
