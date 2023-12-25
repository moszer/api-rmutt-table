const express = require('express');
const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');
const { URLSearchParams } = require('url');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors()); //fix cors
app.use(express.json());

const scheduleData = [];
const holdingdata = [];

const getCookie = async () => {
  try {
    const response = await axios.get('https://oreg3.rmutt.ac.th/registrar/');
    return response.headers['set-cookie'];
  } catch (error) {
    throw new Error(error);
  }
};

const postData = {
  f_uid: '',
  f_pwd: '',
  BUILDKEY: '2289',
};

const makePostRequest = async (cookie) => {
  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
    },
    responseType: 'arraybuffer',
  };

  try {
    await axios.post(
      'https://oreg3.rmutt.ac.th/registrar/validate.asp',
      new URLSearchParams(postData).toString(),
      config
    );

    const pageResponse = await axios.post(
      'https://oreg3.rmutt.ac.th/registrar/time_table.asp',
      new URLSearchParams(postData).toString(),
      config
    );

    const utf8Data = iconv.decode(pageResponse.data, 'windows-874');
    const $ = cheerio.load(utf8Data);

    const jsonData = [];

    $('tr').each((index, element) => {
      const rowObject = {};
      $(element).find('td, th').each((cellIndex, cellElement) => {
        const cellText = $(cellElement).text().trim();
        const colspanValue = $(cellElement).attr('colspan');

        if (colspanValue) {
          rowObject[`column${cellIndex + 1}_colspan`] = Number(colspanValue);
        }

        rowObject[`column${cellIndex + 1}`] = cellText;
      });

      jsonData.push(rowObject);
    });

    scheduleData.push(...jsonData);

    // ทำให้ฟังก์ชันเป็น Promise และส่งค่าเพื่อให้ใช้ await ได้
    return Promise.resolve(); 
  } catch (error) {
    throw new Error(error);
  }
};

app.post('/schedule', async (req, res) => {
  try {

    // Clear the arrays at the beginning of each request 
    scheduleData.length = 0;
    holdingdata.length = 0;

    const { username_, password_ } = req.body;

    postData.f_uid = username_;
    postData.f_pwd = password_;

    const initialCookie = await getCookie();
    
    // เพิ่ม await เพื่อรอให้ makePostRequest เสร็จสิ้นก่อนที่จะดำเนินการต่อ
    await makePostRequest(initialCookie);

    const filteredSchedule = scheduleData.filter((item) =>
      ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์', 'Day/Time'].includes(item.column1)
    );

    const name_ = scheduleData.filter((item) => ['ชื่อ'].includes(item.column2))

    console.log(username_, password_);
    console.log(name_)

    if (filteredSchedule.length === 0) {
      return res.status(204).send('No data');
    }

    function parseScheduleData(days) {
      let i = 0; // Declare i inside the function
      const DATA_parse = filteredSchedule[days];
      const dayData = {};

      for (const key in DATA_parse) {
        if (key.endsWith('_colspan')) {
          value_Data = DATA_parse[key];
        } else {
          let currentKey = DATA_parse[key] || `Nodata${i}`;

          while (dayData[currentKey]) {
            i += 1;
            currentKey = `${DATA_parse[key]}ID:_${i}`;
          }

          dayData[currentKey] = value_Data;
          if (DATA_parse[key] === '') {
            dayData[`Nodata${i}`] = value_Data;
          }
          i += 1;
        }
      }

      holdingdata.push(dayData);
    }

    for (let i = 0; i <= 7; i++) {
      parseScheduleData(i);
    }

    //convert hours to time

      function convertHoursToTime(input) {
        // เวลาเริ่มต้น
        let startTime = 8;
    
        // แปลง input เป็น output
        let output = {};
    
        // วนลูปผ่านทุกวัน
        input.forEach((day, index) => {
            let currentTime = startTime;
            let dailyOutput = {};
            for (const key in day) {
                // ตรวจสอบว่า key เป็นวันหยุดหรือไม่
                if (!['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'].includes(key)) {
                    const adjustedHours = day[key] / 4; // หารด้วย 4
                    dailyOutput[key] = `${currentTime}:00-${currentTime + adjustedHours}:00`;
                    currentTime += adjustedHours;
                }
            }
            output[`Day_${index + 1}`] = dailyOutput;
        });
    
        return output;
    }
    
    const result = convertHoursToTime(holdingdata);

    res.status(200).json(result);


  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});