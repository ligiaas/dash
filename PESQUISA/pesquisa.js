from datetime import datetime, timedelta
from cs.custom.misc import localize_to_utc, localize_from_utc, convert_stringtodatetime
from uuid import uuid1
from cs.apps.analytics.interface import execute
from cs.utils.cassandra_utils import datetime_to_cql
from pandas import Series
import requests
from json import loads

guid =  uuid1()
empresa = 'gama'

canal = 'smart'

#QUANDO VIRAR O MES MUDA DATA
hoje = datetime.now()
dia = hoje.day
mes = hoje.month
ano = hoje.year
data_inicial= datetime(ano,mes,1,0,0,0)
data_final = localize_to_utc(datetime.now() + timedelta(days=1))

#data_inicial = localize_to_utc(convert_stringtodatetime(kwargs.get('initial_date')))
#data_final = localize_to_utc(convert_stringtodatetime(kwargs.get('final_date')))

def secondsToHours(seconds):
    seconds = int(seconds)
    second = int(seconds % 60)
    minute_ = seconds // 60
    minute = minute_ % 60
    hours = minute_ // 60
    convert = '{}:{}:{}'.format(str(hours).zfill(2), str(minute).zfill(2),
                                str(second).zfill(2))  # zfill limitador do 0 à esquerda
    return convert


def removeOutliners(dfin):
    q1 = dfin.quantile(0.25)
    q3 = dfin.quantile(0.75)
    iqr = q3 - q1
    low = q1 - 1.5 * iqr
    high = q3 + 1.5 * iqr
    df_new = dfin.loc[(dfin > low) & (dfin < high) & (dfin != 0)]
    return df_new


def retornaHC():
    host_url = requests.get('https://amx.cscloud.biz/csapi/v2/monitor/?cssession={}'.format(cssession.cssession))
    #host_url = requests.get('https://amx.cscloud.biz/csapi/v2/monitor/?cssession={}'.format('0c04a610-7e35-11e8-9e6d-005056bb309c'))
    total_usuarios = 0
    if host_url.status_code == 200:
        result = loads(host_url.content.decode('latin1'))
    else:
        result = None
        raise Exception('Erro ao chamar URL [{}]'.format(host_url.status_code))

    if result:
        total_usuarios = result['qtt_total']

    return total_usuarios
    

def busca_dados(dt_ini, dt_fim, cnl):
    sql_SC = '''SELECT "DATA_OCORRENCIA", "LABEL", "VALUE" FROM "R_MR_NAVEGACAO_URA_POR_CANAL" 
    WHERE 
        "DATA_OCORRENCIA" >= '{}' AND
        "DATA_OCORRENCIA" <= '{}' AND 
        "LABEL" = '{}' ALLOW FILTERING; '''.format(datetime_to_cql(dt_ini), datetime_to_cql(dt_fim), cnl)

    return execute(empresa, sql_SC)


guid = uuid1()

TABELA_PRINCIPAL = dict()
L_DIA = dict()
L_HORA = dict()
MPL = dict()
SP = dict()
lista_duracao = []

dados = busca_dados(data_inicial, data_final, canal)
indica_retencao = []
limite = 6

for dado in dados.result():
    info = dado.VALUE
    is_transfer = int(info["is_transfer"]) if info["is_transfer"] != '' else 0
    duracao = float(info["duracao_ura"]) if info["duracao_ura"] != '' else 0
    lista_duracao.append(duracao)
    scriptpoint = info["scriptpoint"]
    motivo_por_ligar = info["mpl"] if info["mpl"] != '' else 'Não Informado'
    scriptpoint_cod = info["scriptpoint_cod"]
    erro = info["erro_consulta"]
    data_atendimento = dado.DATA_OCORRENCIA
    dia = data_atendimento.strftime('%Y-%m-%d')
    hora = data_atendimento.strftime('%H')

    classe = None
    
    """
    if is_transfer == 1:
        classe = 'transf'

    elif scriptpoint_cod in indica_retencao:
        classe = 'retida'

    elif erro != '':
        classe = 'erro'
    """
    #nova avaliação de classificação
    if is_transfer == 1:
        classe = 'transf'

    elif erro != '':
        classe = 'erro'
        
    elif is_transfer == 0:
        classe = 'retidas'
    
    total = TABELA_PRINCIPAL.setdefault('TOTAL',
                                        {'total': 0,
                                         'retidas': 0,
                                         'transf': 0,
                                         'erro': 0,
                                         'soma_tempo': 0
                                         })

    liga_dia = L_DIA.setdefault(dia,
                                {'total': 0,
                                 'transf': 0,
                                 'retidas': 0,
                                 'erro': 0,
                                 'soma_tempo': 0,
                                 'data_atendimento': data_atendimento
                                 })

    liga_hora = L_HORA.setdefault(hora + 'h',
                                {'total': 0,
                                 'transf': 0,
                                 'retidas': 0,
                                 'erro': 0,
                                 'soma_tempo': 0,
                                 'hora_atendimento': int(hora)
                                 })

    mpl = MPL.setdefault(motivo_por_ligar,
                         {'total': 0
                          })

    script_point_count = SP.setdefault(scriptpoint,
                                       {'total': 0
                                        })

    if classe:
        mpl['total'] += 1
        
        liga_dia['total'] += 1
        liga_dia[classe] += 1
        liga_dia['soma_tempo'] += duracao
        
        liga_hora['total'] += 1
        liga_hora[classe] += 1
        liga_hora['soma_tempo'] += duracao

        total['total'] += 1
        total[classe] += 1
        total['soma_tempo'] += duracao

        script_point_count['total'] += 1

###############trata dados da BOX ###############################
hc = retornaHC()
media = "00:00:00"

if len(lista_duracao) > 0:
    media_serie = Series(lista_duracao)
    remove_outliner = removeOutliners(media_serie)
    media = secondsToHours(remove_outliner.mean())

total_atendimentos = TABELA_PRINCIPAL['TOTAL']['total']
t_transf = TABELA_PRINCIPAL['TOTAL']['transf']
t_retida = TABELA_PRINCIPAL['TOTAL']['retidas']
t_erro = TABELA_PRINCIPAL['TOTAL']['erro']
t_mpl = 'MPL'
t_script_point = 'SP'

p_transf = round((t_transf / total_atendimentos) * 100) if total_atendimentos > 0 else 0
p_retida = round((t_retida / total_atendimentos) * 100) if total_atendimentos > 0 else 0
p_erro = round((t_erro / total_atendimentos) * 100) if total_atendimentos > 0 else 0

lista_cor = ['#A466B3', '#B381C0', '#BD93CA', '#C8A4D2', '#D2B7DB', '#E6D6EB']
lista_cor_2 =[ '#9D5EB0','#A66CB7', '#A569B6', '#C8A4D2', '#D2B7DB'] #, '#E6D6EB' ]

###############Trata dados do grafico de data  ###############################33
grafico_dia = [{'date': d_dia,
                'transf': dados_dia['transf'],
                'retidas': dados_dia['retidas'],
                'total': dados_dia['total']} for d_dia, dados_dia in L_DIA.items()]

grafico_dia = sorted(grafico_dia, key=lambda d: d['date'])

###############Trata dados do grafico de hora  ###############################
grafico_hora = [{'hour': d_hour,
                'transf': dados_hora['transf'],
                'retidas': dados_hora['retidas'],
                'total': dados_hora['total']} for d_hour, dados_hora in L_HORA.items()]

grafico_hora = sorted(grafico_hora, key=lambda d: d['hour'])


###############################grafico mpl################################
g_pizza_mpl = []
for c_mpl, c_tipo_mpl in sorted(MPL.items()):
    #g_pizza_mpl.append({"label": c_mpl, "value": c_tipo_mpl["total"], "color": lista_cor})
    g_pizza_mpl.append({"label": c_mpl, "value": c_tipo_mpl["total"]})

g_pizza_mpl = sorted(g_pizza_mpl, key=lambda d: d['value'], reverse=True)[:limite]
###############################grafico script_point################################
g_pizza_script = []
for c_script, c_tipo_script in sorted(SP.items()):
    #g_pizza_script.append({"label": c_script, "value": c_tipo_script["total"], "color": lista_cor})
    g_pizza_script.append({"label": c_script, "value": c_tipo_script["total"]})

g_pizza_script = sorted(g_pizza_script, key=lambda d: d['value'], reverse=True)[:limite]

data = {
    "dataProvider": grafico_hora,
    "boxes": [
        {"hint": "LOGADOS NO SISTEMA", "label": "LOGADOS", "value": hc, "icon": "glyphicons-group", "icon_color": "#F3EBF5", "alert_color": lista_cor[5]},
        {"hint": "Total", "label": "CHAMADAS", "value": total_atendimentos, "icon": "glyphicons-call-incoming", "icon_color": "#F3EBF5", "alert_color": lista_cor[4]},
        {"hint": "Transferência Humana", "label": "Transf. Human", "value": t_transf, "icon": "glyphicons-headset", "icon_color": "#F3EBF5", "percent_value": str(p_transf) + " %", "alert_color": lista_cor[3]},
        {"hint": "Retida", "label": "Retida", "value": t_retida, "icon": "glyphicons-cogwheels", "icon_color": "#F3EBF5", "percent_value": str(p_retida) + " %" , "alert_color": lista_cor[2]},
        {"hint": "Falha na Integração SOA", "label": "Falha Integração", "value": t_erro, "icon": "glyphicons-warning-sign", "icon_color": "#F3EBF5", "percent_value": str(p_erro) + "%", "alert_color": lista_cor[1]},
        {"hint": "TMU", "label": "TMU", "value": media, "icon": "glyphicons-stopwatch", "icon_color": "#F3EBF5", "alert_color": lista_cor[0]}],
    
    #teste
    "total_mpl": t_mpl,
    
    "total_script_point":  t_script_point,
    
    "pizza_mpl": g_pizza_mpl,

    "pizza_script_point": g_pizza_script,

    "linha": grafico_dia,

    "barra": {
        "baldes": [
            {"text": "Transferidas", "color": "#009933"},
            {"text": "Retidas", "color": "#FFA500"},
            {"text": "Erro", "color": "#FE0000"}
        ],
    }
}

HTML= """
<style>
  html, body{
    margin: 0;
    padding: 0;
    height: 100%%;
  }
  .divLarge{
    display: inline-block;
    width: calc(100%% - 155px);
    vertical-align: top;
  }
  .divSmall{
    display: inline-block;
    width: 150px;
    vertical-align: top;
  }
  .linkTopo{
    cursor: pointer;
  }
  .linkTopo:hover{
    opacity: 0.6;
  }
  .div_panel{
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    height: 100%%;
  }
  .box_sup{
    margin: 4px 0;
    background: #d8d8d8;
    padding: 12px;
  }
  .box_title{
    padding: 40px 0;
    font-size: 4em;
    text-align: center;
  }
  .number_sup{
    color: #333333;
    display: inline-block;
    font-size: 2.2em;
    line-height: .7em;
    padding-top: 10px;
  }
  .percent_sup{
    display: inline-block;
    color: #F3EBF5;
    font-size: 1em;
    line-height: .7em;
    padding: 10px;
    vertical-align: top;
  }
  .text_sup{
    color: #333333;
    font-size: 12px;
    text-align: left;
    text-transform: uppercase;
  }
  .box_grafico{
    vertical-align: top;
    margin: 5px;
    background: transparent;
    padding: 10px;
  }
  .graph_divider_2{
    display: inline-block;
    width: calc(50%% - 35px);
  }
  .total_height{
    height: 100%%;
  }
  .height_max{
    height: calc(100%% - 10px);
  }
  .height_divider{
    height: 50%%;
    margin-bottom: 6px;
  }
  #graph01, #graph03{
    height: calc(100%% - 10px);
  }
  #graph02, #graph04{
    width: 100%%;
    height: 300px;
  }
</style>

<!-- HTML -->

<div class="div_panel">
  <div class="total_height">
    <div class="divSmall height_max box_top"></div>
    <div class="divLarge height_max">
      <div class="height_divider">
        <div class="box_grafico graph_divider_2 total_height">
          <div id="graph01"></div>
        </div>
        <div class="box_grafico graph_divider_2 total_height">
          <div id="graph03"></div>
        </div>
      </div>
      <div class="height_divider">
        <div class="total_height" style="vertical-align: top;">
          <div class="box_grafico graph_divider_2 total_height">
            <div id="graph02"></div>
          </div>
          <div class="box_grafico graph_divider_2 total_height">
            <div id="graph04"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- SCRIPT -->
<script>
  
  $('body').off('click', '.linkTopo');
  $('body').on('click', '.linkTopo', function(){
    window.open($(this).attr('data-link'));
  });

  (function onInit(){
    setTimeout(function(){
    var data = %s;
    console.log(data)
      
      
    var chart = AmCharts.makeChart("graph01", {
        "type": "serial",
        "addClassNames": true,
        // "id": "g01"
        "theme": "light",
        "dataDateFormat": "YYYY-MM-DD",
        //"precision": 2,
        "valueAxes": [{
        "id": "v1",
        "title": "Ligações Dia",
        //"labelsEnabled": false, // 
        "position": "left",
        "autoGridCount": false,   
      }, {
        "id": "v2",
        "title": "",
        "gridAlpha": 0,    
        "position": "right",
        "autoGridCount": false,
        "labelsEnabled": false,
        //"inside": true,
      }],
      "graphs": [{
        "id": "g3",
        "valueAxis": "v1",
        "lineColor": "#e1ede9",
        "fillColors": "#e1ede9",
        "fillAlphas": 1,
        "type": "column",
        "title": "Total Ligações",
        "valueField": "total",
        "clustered": false,
        "columnWidth": 0.5,
        "legendValueText": "[[value]]",
        "balloonText": "[[title]]<br /><b style='font-size: 130%%'>[[value]]</b>"
      }, {
        "id": "g4",
        "valueAxis": "v1",
        
        "lineColor": "#7ECDC9",
        "fillColors": "#7ECDC9",
        "fillAlphas": 1,
        "type": "column",
        "title": "Trânsferidas",
        "valueField": "transf",
        "clustered": false,
        "columnWidth": 0.3,
        "legendValueText": "[[value]]",
        "balloonText": "[[title]]<br /><b style='font-size: 130%%'>[[value]]</b>"
      }, {
        "id": "g1",
        "valueAxis": "v1",
        "bullet": "round",
        "bulletBorderAlpha": 1,
        "bulletColor": "#FFFFFF",
        "bulletSize": 5,
        "hideBulletsCount": 50,
        "lineThickness": 2,
       
        "lineColor": "#20acd4",
        "type": "smoothedLine",
        "title": "Retidas URA",
        "useLineColorForBulletBorder": true,
        //"dashLength": 5,
        "valueField": "retidas",
        "balloonText": "[[title]]<br /><b style='font-size: 130%%'>[[value]]</b>",
        
        "classNameField": "bulletClass",
        "showBalloon": true,
        "animationPlayed": true,
      },
      
      ],
      
      "chartCursor": {
        "categoryBalloonDateFormat": "DD/MM",
        "pan": true,
        "valueLineEnabled": true,
        "valueLineBalloonEnabled": true,
        "cursorAlpha": 0,
        "valueLineAlpha": 0.2
        
      },
      "categoryField": "date",
      "categoryAxis": {
        "parseDates": true,
        "minPeriod": "DD",
        "dashLength": 1,
        "minorGridEnabled": true,
        
        "dateFormats": [ {
          "period": 'DD',
          "format": 'DD'
        }, {
          "period": 'WW',
          "format": 'MMM DD'
        }, {
          "period": 'MM',
          "format": 'MMM'
        }, {
          "period": 'YYYY',
          "format": 'YYYY'
        } ]
        
      },
      "legend": {
        "useGraphSettings": true,
        //"position": "top"
      },
      "balloon": {
        "borderThickness": 1,
        "shadowAlpha": 0
      },
      "export": {
       "enabled": false 
      },
      ////////////////
      "dataProvider": data.linha,
    });
      
    ///////////////////////////////////////////////////////////////////////////////////  
      
      
var chart = AmCharts.makeChart("graph02", {
    "type": "serial",
    "addClassNames": true,
    // "id": "g01"
    "theme": "light",
    //"dataDateFormat": "YYYY-MM-DD JJ:NN:SS",
    //"precision": 2,
    "valueAxes": [{
    "id": "v1",
    "title": "Ligações Hora",
    //"labelsEnabled": false, // 
    "position": "left",
    "autoGridCount": false,   
  }, {
    "id": "v2",
    "title": "",
    "gridAlpha": 0,    
    "position": "right",
    "autoGridCount": false,
    "labelsEnabled": false,
    //"inside": true,
  }],
  "graphs": [{
    "id": "g3",
    "valueAxis": "v1",
    "lineColor": "#e1ede9",
    "fillColors": "#e1ede9",
    "fillAlphas": 1,
    "type": "column",
    "title": "Total Ligações",
    "valueField": "total",
    "clustered": false,
    "columnWidth": 0.5,
    "legendValueText": "[[value]]",
    "balloonText": "[[title]]<br /><b style='font-size: 130%%'>[[value]]</b>"
  }, {
    "id": "g4",
    "valueAxis": "v1",
    
    "lineColor": "#7ECDC9",
    "fillColors": "#7ECDC9",
    "fillAlphas": 1,
    "type": "column",
    "title": "Trânsferidas",
    "valueField": "transf",
    "clustered": false,
    "columnWidth": 0.3,
    "legendValueText": "[[value]]",
    "balloonText": "[[title]]<br /><b style='font-size: 130%%'>[[value]]</b>"
  }, {
    "id": "g1",
    "valueAxis": "v1",
    "bullet": "round",
    "bulletBorderAlpha": 1,
    "bulletColor": "#FFFFFF",
    "bulletSize": 5,
    "hideBulletsCount": 50,
    "lineThickness": 2,
   
    "lineColor": "#20acd4",
    "type": "smoothedLine",
    "title": "Retidas URA",
    "useLineColorForBulletBorder": true,
    //"dashLength": 5,
    "valueField": "retidas",
    "balloonText": "[[title]]<br /><b style='font-size: 130%%'>[[value]]</b>",
    
    "classNameField": "bulletClass",
    "showBalloon": true,
    "animationPlayed": true,
  }, 
    
  
  ],
  
  "chartCursor": {
    //"categoryBalloonDateFormat": "JJ",
    "pan": true,
    "valueLineEnabled": true,
    "valueLineBalloonEnabled": true,
    "cursorAlpha": 0,
    "valueLineAlpha": 0.2
    
  },
  "categoryField": "hour",
  "categoryAxis": {
    "parseDates": false,
    "minPeriod": "JJ",
    "dashLength": 1,
    "minorGridEnabled": true,
    
    "dateFormats": [ {
      "period": 'DD',
      "format": 'DD'
    }, {
      "period": 'WW',
      "format": 'MMM DD'
    }, {
      "period": 'MM',
      "format": 'MMM'
    }, {
      "period": 'YYYY',
      "format": 'YYYY'
    } ]
    
  },
  "legend": {
    "useGraphSettings": true,
    //"position": "top"
  },
  "balloon": {
    "borderThickness": 1,
    "shadowAlpha": 0
  },
  "export": {
   "enabled": false 
  },
  ////////////////
  "dataProvider": data.dataProvider,
});
      
   ////////////////////////////////////////////////////////////////////////////////////////////////////////////////   
    
      CSCharts.createPie({
        id: 'graph03',
        data: data.pizza_script_point,
        innerRadius: 65,
        allLabels: [{
          "y": "44%%",
          "align": "center",
          "size": 20,
          "bold": true,
          "text": data.total_script_point,
          "color": "#555"
        }],
        legend_size: 12,
        legend: true,
        label: false,
        label_text:"[[percents]]%%",
        label_radius: -10,
        percent_precision: 0
      });
      CSCharts.createPie({
        id: 'graph04',
        data: data.pizza_mpl,
        innerRadius: 65,
        allLabels: [{
          "y": "44%%",
          "align": "center",
          "size": 20,
          "bold": true,
          "text": data.total_mpl,
          "color": "#555"
        }],
        legend_size: 12,
        legend: true,
        label: false,
        label_text:"[[percents]]%%",
        label_radius: -10,
        percent_precision: 0
      });
  
      var htmlTopo = '';
      for (var i=0; i < data.boxes.length; i++){
        var obj = data.boxes[i];
        var estilo = '';
        if(obj.alert_color){
          estilo = 'background: '+obj.alert_color+' !important';
        }
        if(obj.link){
          htmlTopo += '<div class="box_sup linkTopo" style="'+estilo+'" data-link='+obj.link+' data-uk-tooltip="{pos:"left"}" title="'+obj.hint+'">';
        }
        else{
          htmlTopo += '<div class="box_sup" style="'+estilo+'" data-uk-tooltip="{pos:"left"}" title="'+obj.hint+'">';
        }
        if(obj.icon){
          let styleicon = '';
          if(obj.icon_color){
            styleicon = 'color: '+obj.icon_color;
          }
          htmlTopo += '<div class="text_sup">' +
            '<span class="glyphicons '+ obj.icon +'" style="'+ styleicon +'"></span>' +
            '<span>'+ obj.label +'</span>' +
          '</div>';
        }
        else{
          htmlTopo += '<div class="text_sup">' + obj.label + '</div>';
        }
        htmlTopo += '<div class="number_sup">'+obj.value+ (obj.symbol ? obj.symbol : '') +'</div>';
        if(obj.percent_value){
          htmlTopo += '<div class="percent_sup">' + obj.percent_value + '</div>';
        }
        htmlTopo += '</div>';
      }

      $('.box_top').append(htmlTopo);
    }, 500);
  })();
</script>

"""% str(data)

csprogress.set_style_incalculable()
csprogress.set_incalculable_result({'html': HTML})
csprogress.set_success('Fim!')