// 浏览器对象
const objApp = window.external;
const objDatabase = objApp.Database;
const objCommon = objApp.CreateWizObject("WizKMControls.WizCommonUI");
const objWindow = objApp.Window;
const pluginPath = objApp.GetPluginPathByScriptFileName("Global.js");

// 全局变量
var g_isChrome, g_cal, g_createDialog, g_editDialog, g_editPopper, g_unitTest;
var g_app = objApp;
var g_db = objDatabase;
var g_cmn = objCommon;
var g_colorCount = 12;
var g_colorItems = [
	{ "colorValue": "#32CD32", "colorName": g_loc_none },
	{ "colorValue": "#5484ED", "colorName": g_loc_boldBlue },
	{ "colorValue": "#A4BDFE", "colorName": g_loc_blue },
	{ "colorValue": "#46D6DB", "colorName": g_loc_turquoise },
	{ "colorValue": "#7AE7BF", "colorName": g_loc_green },
	{ "colorValue": "#51B749", "colorName": g_loc_boldGreen },
	{ "colorValue": "#FBD75B", "colorName": g_loc_yellow },
	{ "colorValue": "#FFB878", "colorName": g_loc_orange },
	{ "colorValue": "#FF887C", "colorName": g_loc_red },
	{ "colorValue": "#DC2127", "colorName": g_loc_boldRed },
	{ "colorValue": "#DBADFF", "colorName": g_loc_purple },
	{ "colorValue": "#E1E1E1", "colorName": g_loc_gray }
];

// 解决Bootstrap和jQuery UI 在按钮样式上的冲突
var bootstrapButton = $.fn.button.noConflict();  
$.fn.bootstrapBtn = bootstrapButton;

/* 定义类
----------------------------------------------------------------------------------------------------------------------*/

// 实现FullCalendar数据与WizDocEvent数据之间的相互转化
class CalendarEvent {
	constructor( data ) {
		if (!g_db) throw new Error('IWizDatabase is not valid.');
		let type = this._checkDataType(data);
		switch ( type ) {
			case "WizEvent":
				try {
					this._info = this._parseInfo(data.CALENDAR_INFO);
					this._createEvent(data, type);
				} catch (e) { console.error(e); }
				break;
			case "FullCalendarEvent":
				try {
					this._createEvent(data, type);
					// 设置info对象
					this._updateInfo();
				} catch (e) { console.error(e); }
				break;
			case "GUID":
				try {
					//TODO: 获得WizEvent数据，并创建对象
					let doc = g_db.DocumentFromGUID(data);
					let newEventData = {
						"CALENDAR_END" : doc.GetParamValue('CALENDAR_END'),
						"CALENDAR_INFO" : doc.GetParamValue('CALENDAR_INFO'),
						"CALENDAR_START" : doc.GetParamValue('CALENDAR_START'),
						"created" : moment(doc.DateCreated).format('YYYY-MM-DD HH:mm:ss'),
						"guid" : doc.GUID,
						"title" : doc.Title,
						"updated" : moment(doc.DateModified).format('YYYY-MM-DD HH:mm:ss')
					}
					this._createEvent(newEventData, 'WizEvent');
				} catch (e) { console.error(e); }
				break;
		}
	};

	_createEvent(data, type) {
		let start, end, id, bkColor, allDay
		switch (type) {
			case "WizEvent":
				// 统一变量
				id = data.guid;
				start = data.CALENDAR_START;
				end = data.CALENDAR_END;
				// 判断是否用户自定义背景色
				bkColor = this._info.ci == 0 ? this._info.b : g_colorItems[this._info.ci].colorValue;
				allDay = data.CALENDAR_END.indexOf("23:59:59") != -1 ? true : false;
				break;
			case "FullCalendarEvent":
				id = data.id;
				start = data.start;
				end = data.end;
				bkColor = data.backgroundColor;
				allDay = data.allDay ? data.allDay : !$.fullCalendar.moment(data.start).hasTime();
				break;
			default:
				throw new Error('Can not identify data type.')
				break;
		}
		// 基本信息
		this.id = id;
		this.title = data.title;
		// 时间信息
		this.allDay = allDay;
		// 注意！start/end 可能是moment对象或者str，所以一律先转换成moment再格式化输出
		this.start = allDay ? moment(start).format("YYYY-MM-DD") : moment(start).format('YYYY-MM-DD HH:mm:ss');
		this.end = allDay ? moment(end).format("YYYY-MM-DD") : moment(end).format('YYYY-MM-DD HH:mm:ss');
		this.created = data.created ? data.created : moment(start).format('YYYY-MM-DD HH:mm:ss');
		this.updated = data.updated ? data.updated : moment().format('YYYY-MM-DD HH:mm:ss');
		// 设置信息
		this.textColor = 'black';
		this.backgroundColor = bkColor;
	}

	_checkDataType(data) {
		let objClass = data.constructor;
        let guidExam = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        let type;
        switch (objClass) {
            case String:
                if ( guidExam.test(data) ) type = "GUID";
                else throw new Error('Unknown data, cannot create CalendarEvent object.');
                break;
            case Object:
				if ( data.CALENDAR_INFO && data.title ) { 
					type = 'WizEvent';
				} else if ( data.start && data.title ) {
					type = 'FullCalendarEvent';
				}
                break;
        }
        return type;
	};

	_parseInfo(infoStr) {
		let infoObject = {};
		// 拆解CALENDAR_INFO
		let infoArr = infoStr.split('/');
		infoArr.forEach(function(item, index, arr){
			let pair = item.split('=');
			infoObject[pair[0]] = pair[1];
		});
		// 处理颜色值
		infoObject.b = '#' + infoObject.b;
		
		return infoObject;
	};

	_stringifyInfo(infoObject = this._info) {
		this._updateInfo();
		let infoArr = [];
		let infoAttrArr = Object.keys(infoObject);
		infoAttrArr.forEach(function(item, index, arr){
			let singleInfo = `${item}=${infoObject[item]}`;
			infoArr.push(singleInfo);
		});
		return infoArr.join('/').replace('#', '');
	};

	_updateInfo() {
		let that = this;
		let infoObject = {
			'b': null,
			'r': '-1',
			'c': '0',
			'ci': 0 // 默认 0 表示背景为用户自定义
		};
		// 更新背景色'b'
		infoObject['b'] = this.backgroundColor.replace('#', '');
		// 更新颜色指数'ci'
		g_colorItems.forEach(function(item, index, arr){
			if ( item.colorValue ==  that.backgroundColor) {
				// 当日程背景色与色表匹配时则用 color idex 来储存（兼容旧日历插件）
				infoObject['ci'] = index;
			};
		});
		// 应用更新
		this._info = infoObject;
	};

	_getEventHtml(title = this.title, content = ''){
		var htmlText = 
			`<html>
				<head>
					<meta http-equiv="Content-Type" content="text/html; charset=unicode">
					<title>${title}</title> 
				</head>
				<body>
					<!--WizHtmlContentBegin-->
					<div>${content}</div>
					<!--WizHtmlContentEnd-->
				</body>
			</html>`;
	
		  return htmlText
	};

	toFullCalendarEvent() {
		// 注意方法返回的只是FullCalendarEvent的数据类型，并不是event对象
		let that = this;
		let newEvent = {};
		let keys = Object.keys(this);
		keys.splice(keys.findIndex( (i) => {return i == '_info'} ), 1);
		keys.forEach(function(item, index, arr){
			newEvent[item] = that[item];
		})
		return newEvent;
	};

	toWizEventData() {
		let that = this;
		let newEvent = {};
		newEvent.title = this.title;
		newEvent.guid = this.id;
		newEvent.CALENDAR_START = this.allDay ? moment(this.start).format('YYYY-MM-DD 00:00:00') : this.start;
		newEvent.CALENDAR_END = this.allDay ? moment(this.end).format('YYYY-MM-DD 23:59:59') : this.end;
		newEvent.CALENDAR_INFO = this._stringifyInfo();
		newEvent.created = this.created;
		newEvent.updated = this.updated;
		return newEvent;
	};

	addToFullCalendar() {
		//TODO: 将自身添加到FullCalendar
		if (!g_cal) throw new Error('Can not find FullCalendar Widget.')
		g_cal.fullCalendar( 'addEventSource', {
			events: [
				this.toFullCalendarEvent()
			]
		});
	};

	_saveAllProp() {
		//TODO: 保存全部数据包括Title
		// 更新事件文档数据
		let doc = g_db.DocumentFromGUID(this.id);

		// 保存标题
		doc.Title = this.title;

		// 保存时间数据
		if ( this.allDay ) {
			let startStr = moment(this.start).set({'h': 0, 'm': 0, 's': 0}).format('YYYY-MM-DD HH:mm:ss');
			let endStr = moment(this.end).set({'h': 23, 'm': 59, 's': 59}).format('YYYY-MM-DD HH:mm:ss');
			setParamValue(doc, "CALENDAR_START", startStr);
			setParamValue(doc, "CALENDAR_END", endStr);
		} else {
			let startStr = moment(this.start).format('YYYY-MM-DD HH:mm:ss');
			let endStr = moment(this.end).format('YYYY-MM-DD HH:mm:ss');
			setParamValue(doc, "CALENDAR_START", startStr);
			setParamValue(doc, "CALENDAR_END", endStr);
		}

		// 保存 CALENDAR_INFO
		this._updateInfo();
		setParamValue(doc, "CALENDAR_INFO", this._stringifyInfo());
	};

	_createWizEventDoc() {
		//TODO: 保存全部数据包括Title
		// 创建WizDoc
		let location = `My Events/${ moment(this.start).format('YYYY-MM') }/`;
		let objFolder = g_db.GetFolderByLocation(location, true);
		let tempHtml = g_cmn.GetATempFileName('.html');
		let htmlText = this._getEventHtml(this.title, '');
		g_cmn.SaveTextToFile(tempHtml, htmlText, 'unicode');
		let doc = objFolder.CreateDocument2(this.title, "");
		doc.ChangeTitleAndFileName(this.title);
		doc.UpdateDocument6(tempHtml, tempHtml, 0x22);
		// 设置标签
		//if ( tags ) doc.SetTagsText2(tags, "Calendar");
		// 将信息编码到WizDoc属性中去
		let newEvent = this.toWizEventData();
		doc.AddToCalendar(newEvent.CALENDAR_START, newEvent.CALENDAR_END, newEvent.CALENDAR_INFO);
		// change database
		doc.type = "event";
		//
		this.id = doc.GUID;
	}

	saveToWizEventDoc( prop = 'all' ) {
		if (!g_db || !g_cmn) throw new Error('IWizDatabase or IWizCommonUI is not valid.');
		//检查文档是否存在
		const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		const isWizDocExist = guidRegex.test(this.id);
		// 创建或者更新文档
		if ( isWizDocExist ) {
			// 根据指令更新内容
			this._saveAllProp();
			// 更新FullCalendar
		} else {
			// 创建新的事件文档
			this._createWizEventDoc();
		}
		
	};

	deleteEventData( isDeleteDoc = false ){
		if (!g_cal) throw new Error('Can not find FullCalendar Widget.')
		let doc = g_db.DocumentFromGUID(this.id);
		if (!doc) throw new Error('Can not find Event related WizDocument.')
		// 移除FullCalendar事件
		g_cal.fullCalendar('removeEvents', this.id);
		// 移除日历数据
		doc.RemoveFromCalendar();
		// 删除文档
		if ( isDeleteDoc ) doc.Delete();
	}

	refetchData() {
		//TODO: 重数据库重新获取数据更新实例
	};

	renderEvent() {
		// 看该事件是否已存在，如果存在则updateEvent
		if (!g_cal) throw new Error('Can not find FullCalendar Widget.')
	};

	refreshEvent(event) {
		if ( event ) {
			// 重新渲染FullCalendar事件
			event.title = this.title;
			event.backgroundColor = this.backgroundColor;
			g_cal.fullCalendar('updateEvent', event);
		} else {
			//用.fullCalendar( ‘clientEvents’ [, idOrFilter ] ) -> Array 获取源数据从而更新
			//TODO: 遍历并寻找GUID匹配的事件
		}
	}

	static refreshEventSources() {
		//TODO: 将FullCalendar所有Sources删除，重新添加
		// 没点击一个视图更新时就执行
	}

}

/* 定义组件
----------------------------------------------------------------------------------------------------------------------*/

$.widget("tc.EventPopover", {
	options: {
		title: 'No title !', //String
		content: '',
		template: `
		<div class="popover" role="tooltip">
		  <div class="arrow"></div>
		  <div class="popover-header"></div>
		  <div class="popover-body"></div>
		</div>`,
		templatePreprocessor: null, // 传入 this 作为参数
		placement: 'right',
		offset: '10px',
		autoShow: true,
		reference: null, // 用户输入时可以时jQuery或者HTMLElement
	},
	
	_create: function() {
		let that = this;
		let opts = this.options;
		
		// 检测是否提供reference，没有则设置为 this.element，统一格式化为jQuery对象；
		opts.reference = opts.reference ? $(opts.reference) : this.element;

		// 准备模板，有重复调用的bug
		this.$popperNode = this._processTemplate(opts.template);

		// 创建Popper实例(定位引擎)
		this.popperInstance = new Popper(opts.reference.get(0), this.$popperNode.get(0), {
			placement: opts.placement,
			modifiers: {
				arrow: {
				  element: '.arrow'
				}
			},
		});

		// 设置自动隐藏
		this._setAutoHide();

		//根据设置是否自动显示
		if ( opts.autoShow == true ) this.show();

	},

	_processTemplate: function(template) {
		//TODO: 判断template是字符串还是HTMLElement或者jQuery对象
		let opts = this.options;
		let tpp = opts.templatePreprocessor;

		let popper;
		if ( typeof tpp == 'function' ) {
			popper = tpp(template, this);
		} else {
			popper = $(template);
			popper.find('.tc-popover-header').text(opts.title);
		}

		return popper; // jQuery
	},

	_setAutoHide() {
		let opts = this.options;
		let that = this;

		// 先取消已有自动隐藏事件，方式反复添加句柄
		this._off(this.document, 'click');

		// 点击空白处自动隐藏
		this._on(this.document, {
			click: function(e) {
				if (
					// 不是日历事件元素
					!$(opts.reference).is(e.target) &&
					// 也不是子元素
					$(opts.reference).has(e.target).length === 0 &&
					// 不是popper元素
					 !that.$popperNode.is(e.target) &&
					// 也不是子元素
					that.$popperNode.has(e.target).length === 0
				) {
					that.hide();
				}
			}
		})
	},

	update: function() {
		// 根据Options更新popperInstance以及$popperNode
		let opts = this.options;
		// 设置自动隐藏
		this._setAutoHide();
		// 更新 $popperNode
		this.$popperNode = this._processTemplate(this.$popperNode); // 传入的是引用
		// 更新 popperInstance
		this.popperInstance.popper = this.$popperNode.get(0);
		this.popperInstance.reference = opts.reference ? $(opts.reference).get(0) : this.element.get(0);
		this.popperInstance.update();
	},

	show: function() {
		let opts = this.options;
		// 如果没有添加到DOM树则添加
		if( !$(this.$popperNode).parent().is('body') ) $(this.$popperNode).appendTo('body');
		// 显示$popperNode
		this._show(this.$popperNode);

	},

	hide: function() {
		//TODO: 隐藏Popover
		this._hide(this.$popperNode)
	},

	destroy: function() {
		this.popperInstance.destroy();
		$(this.$popperNode).remove();
		this.$popperNode = null;
	}
})

$.widget("tc.ColorPicker", {
	options: {
		staticOpen: false, // Displays open and stays open. 
		setText: true, // Sets elements’ text to color. 将原始的文本设置设置成颜色值.
		setBGColor: true, // Sets elements’ background color to color.
		hues: 12, // Number of hues of the color grid. Hues are slices of the color wheel.
		hue0: 0, // The first hue of the color grid. 
		shades: 5, // Number of shades of colors and shades of gray between white and black. 
		saturations: 3, // Number of sets of saturation of the color grid.
		customColors: null, // Custom colors added to the top of the grid. 
		notation: 'hex', // Text syntax of colors values.
		className: null, // Class added to Huebee element. Useful for CSS.
		onchange: null,
	},

	_create: function() {
		// 创建实例
		this.huebeeInstance = new Huebee(this.element.get(0), this.options);
		// 重写了该方法，判断input内容是否相同并触发 change 事件
		this.huebeeInstance.setTexts = function() {
			if ( !this.setTextElems ) {
				return;
			}
			  for ( var i=0; i < this.setTextElems.length; i++ ) {
				var elem = this.setTextElems[i];
				var property = elem.nodeName == 'INPUT' ? 'value' : 'textContent';
				// 触发change事件
				if ( elem.value != this.color ) {
					elem[ property ] = this.color;
					elem.dispatchEvent(new Event('change'));
				}
			}
		};
		this.huebeeInstance.on( 'change', this.options.onchange);
		
	}
})


/* 杂项和工具
----------------------------------------------------------------------------------------------------------------------*/

// 判断内核
function isChrome() {
	if (g_isChrome) return g_isChrome;
	//
	var ua = navigator.userAgent.toLowerCase();
	g_isChrome = ua.indexOf('chrome') != -1;
	//
	return g_isChrome;
}

// 写入日志
function toLog(logStr){
	if (g_app) g_app.WriteToLog(logStr);
}

// 将整数转换成日期字符串
function formatIntToDateString(n){
		
	return n < 10 ? '0' + n : n;
}

// 判断实参是否是数组的实例
function IsArray(array) {
    return (array instanceof Array);
}

// 检查及增加数值字符串长度，例如：'2' -> '02'
function checkAndAddStrLength(str) {
	if (str.length < 2) {
		return '0' + str;
	} else {
		return str;
	}
}

// 将日期对象转化为字符串
function _d2s(dt){
    //
    var ret = dt.getFullYear() + "-" + 
	    		formatIntToDateString(dt.getMonth() + 1) + "-" + 
	    		formatIntToDateString(dt.getDate()) + " " + 
	    		formatIntToDateString(dt.getHours())+ ":" + 
	    		formatIntToDateString(dt.getMinutes()) + ":" + 
	    		formatIntToDateString(dt.getSeconds());
    return ret;
}

// 将字符串转化为日期对象
function _s2d(str){
	if (!str)
		return '';
	var date = new Date(str.substr(0, 4),
					str.substr(5, 2) - 1,
					str.substr(8, 3),
					str.substr(11, 2),
					str.substr(14, 2),
					str.substr(17, 2)
					);		
	return date;
}

// 设置文档属性值
function setParamValue(doc, key, value) {
	if (!doc) return false;
	//
	if (isChrome()) {
		doc.SetParamValue(key, value);
	}
	else {
		doc.ParamValue(key) = value;
	}
}


/* 数据获取
----------------------------------------------------------------------------------------------------------------------*/

// TODO: 重写获取数据的方式
function _getWizEvent(start, end) {
	//TODO:
	let events = [];
	let EventCollection = objDatabase.GetCalendarEvents2(start, end);
	return events
}

// 从WizDatabase中获取所有数据文档
function _getAllOriginalEvent(events, start, end){
	let sql = `DOCUMENT_LOCATION not like '/Deleted Items/%' and (KB_GUID is null or KB_GUID = '')`;
	let and1 = ` and DOCUMENT_GUID in (select DOCUMENT_GUID from WIZ_DOCUMENT_PARAM where PARAM_NAME = 'CALENDAR_START'  and  PARAM_VALUE <= '${end}' )`;
	let and2 = ` and DOCUMENT_GUID in (select DOCUMENT_GUID from WIZ_DOCUMENT_PARAM where PARAM_NAME = 'CALENDAR_END'  and  PARAM_VALUE >= '${start}' )`;
	if (start) sql += and2;
	if (end) sql += and1; 
	if (g_db.DocumentsDataFromSQL) {
		try {
			let data = g_db.DocumentsDataFromSQL(sql);
			//
			let obj = JSON.parse(data);
			//
			if (!obj || !IsArray(obj)) return false;
			//
			for (let i = 0; i < obj.length; i ++) {
				events.push(
					new CalendarEvent(obj[i]).toFullCalendarEvent()
				);
			}
			
			return events;
		}
		catch(err) {
			console.error(err);
			return false;
		}
	}
	else {
		throw new Error('Database not exist!');
		let docColletion = g_db.DocumentsFromSQL(sql);
		//
		if (docColletion && docColletion.Count){
			let doc;
			for (let i = 0; i < docColletion.Count; ++ i){
				doc = docColletion.Item(i);
				let eventObj = _eventObject(_newPseudoDoc(doc));
				if (eventObj)
					events.push(eventObj);
			}
			return events;
		}			
	}

}

// 渲染所有事件
function wizRenderAllEvent(){
	if (!g_cal) return false;
	let currentView = g_cal.fullCalendar('getView');
	let doc;
	let eventsArr = [];
	//var objDocColletion = getAllRepeatEventDoc();

	
	//for (var i = 0; i < objDocColletion.Count; i ++){
	//	doc = objDocColletion.Item(i);
	//	if (doc){
	//		_getDocRepeatEvent(events,  _newPseudoDoc(doc));
	//	}		
	//}
	//
	eventsArr = _getAllOriginalEvent(eventsArr, _d2s(currentView.start.toDate()), _d2s(currentView.end.toDate()));
	//
	try {
		g_cal.fullCalendar('removeEvents');
		g_cal.fullCalendar('addEventSource', {
			events: eventsArr
		});
	} catch (e) {
		console.error(e);
	}
	
}

/* 数据获取
----------------------------------------------------------------------------------------------------------------------*/

// 创建事件 start, end, jsEvent, view
function wizCreateEvent(start, end, jsEvent, view){
	try {
		// 获取用户设置
		let colorValue = g_createDialog.find('#tc-createpage-eventcolor').val();
		let titleValue = g_createDialog.find('#tc-createpage-eventtitle').val();
		let newEvent = new CalendarEvent({
			title: titleValue ? titleValue : g_loc_notitle,
			start: start,
			end: end,
			allDay: start.hasTime() && end.hasTime() ? false : true,
			backgroundColor: colorValue ? colorValue : '#32CD32',
		});
		// 保存并渲染事件
		newEvent.saveToWizEventDoc();
		newEvent.refetchData();
		newEvent.addToFullCalendar();
	} catch (e) {console.log(e)}
}

// 更新WizDoc修改时间
function _updateDocModifyDate(doc){
	var now = new Date();
	if (!doc) return false;
	now.setSeconds((now.getSeconds() + 1) % 60);
	doc.DateModified = _d2s(now);
}

// 日历事件拖动后更新数据
function wizUpdateDocDrop(event, delta, revertFunc, jsEvent, ui, view){
	// Call hasTime on the event’s start/end to see if it has been dropped in a timed or all-day area.
	let allDay = !event.start.hasTime();
	// 获取事件文档时间数据
	let doc = g_db.DocumentFromGUID(event.id);
	// 更新数据
	if ( allDay ) {
		let startStr = event.start.set({'h': 0, 'm': 0, 's': 0}).format('YYYY-MM-DD HH:mm:ss');
		let endStr = event.end.set({'h': 23, 'm': 59, 's': 59}).format('YYYY-MM-DD HH:mm:ss');
		setParamValue(doc, "CALENDAR_START", startStr);
		setParamValue(doc, "CALENDAR_END", endStr);
	} else {
		let startStr = event.start.format('YYYY-MM-DD HH:mm:ss');
		let endStr = event.end.format('YYYY-MM-DD HH:mm:ss');
		setParamValue(doc, "CALENDAR_START", startStr);
		setParamValue(doc, "CALENDAR_END", endStr);
	}
	// 
	_updateDocModifyDate(doc);
}

// 日历时间重置时间范围后更新数据
function wizUpdateDocResize(event, delta, revertFunc, jsEvent, ui, view){
	let allDay = event.start.hasTime() ? false : true;
	// 获得事件文档时间数据
	var doc = g_db.DocumentFromGUID(event.id);
	// 计算更改后的结束时间
	var eventEndStr = event.end.format('YYYY-MM-DD HH:mm:ss');
	// 更新文档数据
	setParamValue(doc, "CALENDAR_END", eventEndStr);
	_updateDocModifyDate(doc);
}

///////////////////////////////////////
// 重复事件

// 从文档信息中获得提醒信息
function _getRemindFromInfo(info){
	var infoArray = info.split('/');
	for (var i = 0; i < infoArray.length; i++) {
		if (infoArray[i].indexOf("r=") != -1){
			return infoArray[i].substr(infoArray[i].indexOf("=")+1);
		}
	};
	return;
}

///////////////////////////////////////
// 颜色相关设置

// 从事件信息中获得颜色ID
function _getEventColorIdFromInfo(info){
	var infoArray = info.split('/');
	for (var i = 0; i < infoArray.length; i ++){
		if (infoArray[i].indexOf("ci=") != -1){
			return infoArray[i].substr(infoArray[i].indexOf("=")+1);
		}
	}
	return;
}

// 从事件信息中获得颜色值
function _getEventColorFromInfo(info){
	var infoArray = info.split('/');
	for (var i = 0; i < infoArray.length; i ++){
		if (infoArray[i].indexOf("b=") != -1){
			return infoArray[i].substr(infoArray[i].indexOf("=")+1);
		}
	}
	return;		
}

// 通过ID获得实际颜色值
function getColorValue(colorId){
	if (!colorId || colorId < 0 || colorId > g_colorCount)
		return getCalendarColor();
	return g_colorItems[colorId].colorValue;
}

// 获得颜色名字
function getColorName(colorId){
	if (colorId < 0 || colorId > g_colorCount)
		return;
	return g_colorItems[colorId].colorName;
}

// 返回柠檬绿
function getCalendarColor(){
	return "#32CD32";
}

// 获得日历边框颜色
function getCalendarBorderColor(){
	var calendarColor = getCalendarColor();
	var red = parseInt(calendarColor.substr(1, 2), 16);
	var green = parseInt(calendarColor.substr(3, 2), 16);
	var blue = parseInt(calendarColor.substr(5, 2), 16);

	red -= red * (0.2);
	green -= green * (0.2);
	blue -= blue * (0.2);

	return "#" + checkAndAddStrLength(Math.floor(red).toString(16)) + 
					checkAndAddStrLength(Math.floor(green).toString(16)) + 
					checkAndAddStrLength(Math.floor(blue).toString(16));
}

// 获得事件背景颜色值
function _getEventBkColor(info){
	var colorId = _getEventColorIdFromInfo(info);
	if (!colorId){
		return _getEventColorFromInfo(info);
	}
	if (colorId == 0){
		return getCalendarColor().replace('#', '');
	}else {
		return getColorValue(colorId).replace('#', '');
	}
}

///////////////////////////////////////
// 工具

function WizConfirm(msg, title) {
    return objWindow.ShowMessage(msg, title, 0x00000020 | 0x00000001) == 1;
}


/* 组件初始化
----------------------------------------------------------------*/

///////////////////////////////////////
// 创建组件

/**
 * 创建颜色拾取器.
 * @param {string|HTMLElement} node - 元素或CSS选择器.
 */
function createColorPicker(node) {
	//TODO: 读取Config
	$(node).ColorPicker({
		saturations: 2,
		shades: 5,
		customColors: [ '#32CD32', '#5484ED', '#A4BDFE', 
		'#46D6DB', '#7AE7BF', '#51B749',
		'#FBD75B', '#FFB878', '#FF887C', 
		'#DC2127', '#DBADFF', '#E1E1E1'	]
	});

	return $(node);
}

/**
 * 创建日期时间选择器.
 * @param {string|HTMLElement} node - 元素或CSS选择器.
 */
function createDatetimePicker(node) {
	//TOOD: 读取Config
	$(node).datetimepicker({
		format: 'YYYY-MM-DD HH:mm:ss'
	});

	return $(node);
}

/**
 * 刷新事件句柄.
 * @param {string|HTMLElement} node - 元素或CSS选择器.
 * @param {string} jsEventName - 要刷新的事件名称.
 * @param {function} handle - 要绑定的句柄
 */
function refreshEventHandle(node, jsEventName, handle) {
	// 利用jQuery本身的类数组特性实现多个绑定；
	$(node).off(jsEventName).on(jsEventName, handle);
	return $(node);
}

/**
 * 重置表单.
 * @param {string|HTMLElement} form - 表单或包含表单的块元素|CSS选择器.
 * @param {string} excludes - 用CSS选择器代表需要排除的元素.
 */
function resetFormInput(form, excludes) {
	$(form).find('input').not(excludes).each(function(index,element){
		$(element).css('background-color', '');
		$(element).val('');
	})
}

/**
 * 渲染模态框表单组件.
 * @param {string|HTMLElement} modalNode - 表单或包含表单的块元素|CSS选择器.
 * @param {Object[]} tasks - 任务列表.
 * @param {string} tasks[].node - CSS选择器.
 * @param {string} tasks[].value - 需要填入的值.
 * @param {Function} tasks[].renderer - 组件渲染器.
 * @param {string} tasks[].eventName - 事件名称.
 * @param {Function} tasks[].handle - 句柄.
 */
function renderFormComponent(modalNode, tasks) {
	for (let task of tasks) {
		let $comps = $(modalNode).get(0) == $(task.node).get(0) ? $(task.node) : $(modalNode).find(task.node);
		// 渲染组件
		if ( task.value ) $comps.val(task.value);
		if ( typeof task.renderer == 'function' ) task.renderer($comps);
		// 绑定句柄
		if ( task.handle && typeof task.handle == 'function' && task.eventName ) refreshEventHandle($comps, task.eventName, task.handle);
	}
}

/**
 * 绑定模态框按钮句柄, 通过 refreshEventHandler
 * @param {string|HTMLElement} modalNode - 表单或包含表单的块元素|CSS选择器.
 * @param {Object[]} tasks - 任务列表.
 * @param {string} tasks[].node - CSS选择器.
 * @param {string} tasks[].eventName - 事件名称.
 * @param {Function} tasks[].handle - 句柄.
 */
function bindModalHandle(modalNode, tasks) {
	//TODO: 是否可以将bindModalHandle与renderModalForm合二为一？
	for (let task of tasks) {
		// 判断是否绑定modalNode的句柄
		let $comps = $(modalNode).get(0) == $(task.node).get(0) ? $(task.node) : $(modalNode).find(task.node);
		if ( typeof task.handle == 'function' ) refreshEventHandle($comps, task.eventName, task.handle);
	}
}

///////////////////////////////////////
// 事件句柄

function onCreateBtnClick(start, end, jsEvent, view) {
	wizCreateEvent(start, end, jsEvent, view); // 这一步耗时
	g_createDialog.modal('hide');
	g_cal.fullCalendar('unselect');
}

function onSaveBtnClick(event, formNode) {
	//TODO: 完成开始与结束时间变更
	//TODO: 通过在formNode搜索.eventtitle,.eventcolor等class来获取变量
	if (!g_cal) throw new Error('Can not find FullCalendar Widget.');
	// 保存数据
	let newEvent = new CalendarEvent(event);
	newEvent.title = formNode.find('.eventtitle').val();
	newEvent.backgroundColor = formNode.find('.eventcolor').val();
	// 保存到数据文档
	newEvent.saveToWizEventDoc();
	newEvent.refreshEvent(event)
}

function onDeleteDataBtnClick(event) {
	if (!g_cal) throw new Error('Can not find FullCalendar Widget.');
	if ( WizConfirm("确定要删除该日程？", '番茄助理') ) {
		// 删除日程
		let newEvent = new CalendarEvent(event);
		newEvent.deleteEventData(false);
	}
}

function onDeleteDocBtnClick(event) {
	if (!g_cal) throw new Error('Can not find FullCalendar Widget.');
	if ( WizConfirm("确定要删除该日程源文档？\n「确定」将会导致相关笔记被删除！", '番茄助理') ) {
		let newEvent = new CalendarEvent(event);
		newEvent.deleteEventData(true);
	}	
}

// 渲染事件创建窗口
function renderCreatePage(start, end, jsEvent, view) {
	
	let html = objCommon.LoadTextFromFile(pluginPath + "dialog/EventCreatePage.html");
	g_createDialog = $(html).modal({
		show: false
	});

	// 渲染 DOM
	renderFormComponent(g_createDialog, [
		{
			node: '#tc-createpage-eventstart',
			value: start.format('YYYY-MM-DD HH:mm:ss'),
			renderer: createDatetimePicker
		},
		{
			node: '#tc-createpage-eventend',
			value: end.format('YYYY-MM-DD HH:mm:ss'),
			renderer: createDatetimePicker
		},
		{
			node: '#tc-createpage-eventcolor',
			value: '',
			renderer: createColorPicker
		}
	]);

	// 绑定事件句柄
	bindModalHandle(g_createDialog, [
		{
			node: g_createDialog,
			eventName: 'shown.bs.modal',
			handle: () => g_createDialog.find('#tc-createpage-eventtitle').focus(),
		},
		{
			node: '#tc-createpage-create',
			eventName: 'click',
			handle: () => onCreateBtnClick(start, end, jsEvent, view),
		},
		{
			node: '#tc-createpage-cancel,#tc-createpage-close',
			eventName: 'click',
			handle: () => g_cal.fullCalendar('unselect')
		}
	])
}

// 显示创建窗口
function showCreatePage(start, end, jsEvent, view) {
	//TODO: 为了复用代码，将该函数整合入renderCreatePage
	// 重置表单
	resetFormInput(g_createDialog, '#tc-createpage-eventstart,#tc-createpage-eventend');
	// 刷新参数
	renderFormComponent(g_createDialog, [
		{
			node: '#tc-createpage-eventstart',
			value: start.format('YYYY-MM-DD HH:mm:ss'),
			renderer: null
		},
		{
			node: '#tc-createpage-eventend',
			value: end.format('YYYY-MM-DD HH:mm:ss'),
			renderer: null
		},
	]);
	// 重新绑定创建日程句柄
	bindModalHandle(g_createDialog, [
		{
			node: '#tc-createpage-create',
			eventName: 'click',
			handle: () => onCreateBtnClick(start, end, jsEvent, view)
		}
	])
	//
	g_createDialog.modal('show');
	
}

// 传递参数到完整编辑窗口
function renderEditPage(event, popoverInstance) {
	// 创建
	//TODO: 拆分出一个showEditPage函数
	if ( !g_editDialog ) {
		let html = objCommon.LoadTextFromFile(pluginPath + "dialog/EventEditPage.html");
		g_editDialog = $(html).modal({
			show: false
		})
	}

	// 渲染界面
	renderFormComponent(g_editDialog, [
		{
			node: '#tc-editpage-eventtitle',
			value: event.title,
		},
		{
			node: '#tc-editpage-eventstart',
			value: event.start.format('YYYY-MM-DD HH:mm:ss'),
			renderer: createDatetimePicker
		},
		{
			node: '#tc-editpage-eventend',
			value: event.end.format('YYYY-MM-DD HH:mm:ss'),
			renderer: createDatetimePicker
		},
		{
			node: '#tc-editpage-eventcolor',
			value: event.backgroundColor,
			renderer: (node) => {$(node).css('background-color', event.backgroundColor);createColorPicker(node)}
		},
		{
			node: '#tc-editpage-save',
			renderer: (node) => $(node).attr('disabled', true)
		}
	])

	/* 绑定事件句柄
	 * 一定要注意事件重复绑定
	 * ----------------------------------------------------------------*/

	bindModalHandle(g_editDialog, [
		{
			node: 'input',
			eventName: 'change',
			handle: () => g_editDialog.find('#tc-editpage-save').attr('disabled', false)
		},
		{
			node: '#tc-editpage-eventstart, #tc-editpage-eventend',
			eventName: 'dp.change',
			handle: () => g_editDialog.find('#tc-editpage-save').attr('disabled', false)
		},
		{
			node: '#tc-editpage-save',
			eventName: 'click',
			handle: () => {onSaveBtnClick(event, g_editDialog);g_editDialog.modal('hide')}
		},
		{
			node: '#tc-editpage-delete',
			eventName: 'click',
			handle: () => {onDeleteDataBtnClick(event);g_editDialog.modal('hide');}
		},
		{
			node: '#tc-editpage-deleteEventDoc',
			eventName: 'click',
			handle: () => {onDeleteDocBtnClick(event);g_editDialog.modal('hide');}
		}

	]);
	
	//
	g_editDialog.modal('show')
	// 隐藏窗口
	popoverInstance.hide();
}

// 处理编辑Popper模板
function renderEditPopperTemplate(template, instance) {
	let event = instance.options.args.event;
	let $popper = $(template);

	renderFormComponent($popper, [                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 
		{// 标题
			node: '#tc-editpopper-eventtitle',
			value: event.title,
			eventName: 'change',
			handle: () => $popper.find('#tc-editpopper-save').attr('disabled', false)
		},
		{// 日期
			node: '#tc-editpopper-eventdate',
			value: event.start.format('YYYY-MM-DD HH:mm:ss')
		},
		{// 颜色
			node: '#tc-editpopper-eventcolor',
			value: event.backgroundColor,
			renderer: (node) => {$(node).css('background-color', event.backgroundColor);createColorPicker(node)},
			eventName: 'change',
			handle: () => $popper.find('#tc-editpopper-save').attr('disabled', false)
		},
		{// 保存按钮
			node: '#tc-editpopper-save',
			renderer: (node) => $(node).attr("disabled", true),
			eventName: 'click',
			handle: () => {onSaveBtnClick(event, $popper);instance.hide();}
		},
		{// 编辑按钮
			node: '#tc-editpopper-edit',
			eventName: 'click',
			handle: () => renderEditPage(event, instance)
		},
		{// 删除日程数据按钮
			node: '#tc-editpopper-delete',
			eventName: 'click',
			handle: () => {onDeleteDataBtnClick(event);instance.hide();}
		},
		{// 删除源文档按钮
			node: '#tc-editpopper-deleteEventDoc',
			eventName: 'click',
			handle: () => {onDeleteDocBtnClick(event);instance.hide();}
		}
	])

	return $popper;
}

function renderEditPopper(args, reference) {
	// 渲染弹窗
	let html = objCommon.LoadTextFromFile(pluginPath + "dialog/EventEditPopper.html");
	g_editPopper = $( '<div></div>' ).EventPopover({
		args: args,
		title: event.title,
		template: html,
		templatePreprocessor: renderEditPopperTemplate,
		placement: 'auto',
		reference: reference,
	});
	return g_editPopper;
}
		

// 初始化FullCalendar
$(document).ready(function(){
	// 定义变量
	let date = new Date();
	let d = date.getDate();
	let m = date.getMonth();
	let y = date.getFullYear();
	let isFirst = true;

	// Full Calendar 设置
	g_cal = $('#calendar').fullCalendar({
		themeSystem: 'standard',
		height: 'parent',
		header: {
			left: 'prev,next,today',
			center: 'title',
			right: 'month,agendaWeek,agendaDay,listWeek'
		},
		views: {
			// titleFormat 的语法改变了，原有的以及失效
			month: {
				//titleFormat: g_loc_titleformat_month, //var g_loc_titleformat_month = "MMMM yyyy";
			},
			agenda: {
				minTime: "08:00:00",
				slotLabelFormat: 'h(:mm) a'
			},
			listWeek: {

			}
		},
		navLinks: true,
		allDayDefault: false,
		defaultView: 'agendaWeek',
		eventLimit: true,
		buttonText: {
			today: g_loc_button_today,
			month: g_loc_button_month,
			week: g_loc_button_week,
			day: g_loc_button_day,
			list: '表'
        },
		monthNames: [
            g_loc_monthname_1, g_loc_monthname_2, g_loc_monthname_3, g_loc_monthname_4, 
            g_loc_monthname_5, g_loc_monthname_6, g_loc_monthname_7, g_loc_monthname_8, 
            g_loc_monthname_9, g_loc_monthname_10, g_loc_monthname_11, g_loc_monthname_12
        ],
		monthNamesShort: [
            g_loc_monthnameshort_1, g_loc_monthnameshort_2, g_loc_monthnameshort_3, g_loc_monthnameshort_4, 
            g_loc_monthnameshort_5, g_loc_monthnameshort_6, g_loc_monthnameshort_7, g_loc_monthnameshort_8, 
            g_loc_monthnameshort_9, g_loc_monthnameshort_10, g_loc_monthnameshort_11, g_loc_monthnameshort_12
        ],
		dayNames: [
            g_loc_dayname_0, g_loc_dayname_1, g_loc_dayname_2, g_loc_dayname_3, g_loc_dayname_4, g_loc_dayname_5, g_loc_dayname_6
        ],
		dayNamesShort: [
            g_loc_daynameshort_0, g_loc_daynameshort_1, g_loc_daynameshort_2, g_loc_daynameshort_3, g_loc_daynameshort_4, g_loc_daynameshort_5, g_loc_daynameshort_6
        ],
		selectable: true,
		selectHelper: true,
		unselectCancel: '.modal *',
		allDayText: g_loc_allday,
		nowIndicator: true,
		forceEventDuration: true,
		firstDay: 1, // 第一天是周一还是周天，与datepicker必须相同
		dragOpacity:{
			"month": .5,
			"agendaWeek": 1,
			"agendaDay": 1
		},
		editable: true,

		// 刷新视图，重新获取日历事件
		viewRender: function( view, element ) {
			// 删除所有EventSources，再重新添加
			//TODO: 感觉这样造成性能上的损失
			wizRenderAllEvent();
		},

		// 选择动作触发的事件句柄，定义了一个callback
		select: function(start, end, jsEvent, view){
			// 弹出“创建日历事件”窗口
			// 判断是否渲染
			if ( !g_createDialog ) renderCreatePage(start, end, jsEvent, view);
			// 传递参数
			showCreatePage(start, end, jsEvent, view);
		},

		// 日历事件拖动 event, delta, revertFunc, jsEvent, ui, view
		eventDrop: function(event, delta, revertFunc, jsEvent, ui, view){
			if (event.id){
				//
				wizUpdateDocDrop(event, delta, revertFunc, jsEvent, ui, view);
				
			} else {
				revertFunc();
			}
		},

		// 日历事件日期范围重置
		eventResize: function(event, delta, revertFunc, jsEvent, ui, view){
			if (event.id){
				//
				wizUpdateDocResize(event, delta, revertFunc, jsEvent, ui, view);
				
			} else {
				revertFunc();
			}
		},

		eventRender: function(eventObj, $el) {
			// 元素已经渲染，可修改元素
			/*
			$el.css('background-color', '#E1E1E1');
			$el.find('.fc-content').css('visibility', 'hidden');
			$el.css('border', '1px solid #E1E1E1');
			*/
			/*
			$el.popover({
				title: eventObj.title,
				content: eventObj.description,
				trigger: 'hover',
				placement: 'top',
				container: 'body'
			});
			*/
		},

		// 日历事件点击后事件句柄
		eventClick: function( event, jsEvent, view ) {
			// this 指向包裹事件的<a>元素

			// 判断是否已经渲染弹窗
			
			if ( !g_editPopper ) {
				renderEditPopper({
					'event': event,
					'jsEvent': jsEvent,
					'view': view
				}, this).EventPopover('show');
			} else {
				// 更新reference
				g_editPopper.EventPopover('option', {
					args: {
						'event': event,
						'jsEvent': jsEvent,
						'view': view
					},
					title: event.title,
					reference: this
				}).EventPopover('update').EventPopover('show');
			}

		}
		
	});

	// 初始化数据
	wizRenderAllEvent();
});