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

i_sat = ['1', '2', '3', '4', '5']
cs_agents = ['Detratores', 'Passivos', 'Promotores']
total_atendimentos = TABELA_PRINCIPAL['TOTAL']['total']
t_transf = TABELA_PRINCIPAL['TOTAL']['transf']
t_retida = TABELA_PRINCIPAL['TOTAL']['retidas']
t_erro = TABELA_PRINCIPAL['TOTAL']['erro']
t_mpl = 'MPL'
t_script_point = 'SP'

p_transf = round((t_transf / total_atendimentos) * 100) if total_atendimentos > 0 else 0
p_retida = round((t_retida / total_atendimentos) * 100) if total_atendimentos > 0 else 0
p_erro = round((t_erro / total_atendimentos) * 100) if total_atendimentos > 0 else 0

lista_cor = ['#D31925', '#F06730', '#F58D32', '#FAAE33', '#FFD52D']
lista_cor_2 =[ '#9D5EB0','#A66CB7', '#A569B6', '#C8A4D2', '#D2B7DB'] #, '#E6D6EB' ]
lista_cor_3 =[ '#D31925','#C9C9CA', '#4BA243']

###############Trata dados do grafico de hora  ###############################
grafico_hora = [{'hour': d_hour,
                'transf': dados_hora['transf'],
                'retidas': dados_hora['retidas'],
                'total': dados_hora['total']} for d_hour, dados_hora in L_HORA.items()]

grafico_hora = sorted(grafico_hora, key=lambda d: d['hour'])


data = {
    "dataProvider": grafico_hora,
    "product": 'Sofie',
    "box_01": {
      "question": "1 - Qual a probabilidade de você recomendar o Sofie a um amigo?",
      "legend": "Detratores",
      "data": [
        {"indice": i_sat[0], "hint": "UMA INDICAÇÃO", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[0]},
        {"indice": i_sat[1], "hint": "DUAS INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[1]},
        {"indice": i_sat[2], "hint": "TRÊS INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%" , "alert_color": lista_cor[2]},
        {"indice": i_sat[3], "hint": "QUATRO INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[3]},
        {"indice": i_sat[4], "hint": "CINCO INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[4]}
      ],
      "agents": [
        {"tipo": cs_agents[0], "hint": cs_agents[0], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[0]},
        {"tipo": cs_agents[1], "hint": cs_agents[1], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[1]},
        {"tipo": cs_agents[2], "hint": cs_agents[2], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[2]}
      ]
    },
    "box_02": {
      "question": "2 - Qual a probabilidade de você recomendar o Sofie a um amigo?",
      "legend": "Passivos",
      "data": [
        {"indice": i_sat[0], "hint": "UMA INDICAÇÃO", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[0]},
        {"indice": i_sat[1], "hint": "DUAS INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[1]},
        {"indice": i_sat[2], "hint": "TRÊS INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%" , "alert_color": lista_cor[2]},
        {"indice": i_sat[3], "hint": "QUATRO INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[3]},
        {"indice": i_sat[4], "hint": "CINCO INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[4]}
      ],
      "agents": [
        {"tipo": cs_agents[0], "hint": cs_agents[0], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[0]},
        {"tipo": cs_agents[1], "hint": cs_agents[1], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[1]},
        {"tipo": cs_agents[2], "hint": cs_agents[2], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[2]}
      ]
    },
    "box_03": {
      "question": "3 - Qual a probabilidade de você recomendar o Sofie a um amigo?",
      "legend": "Promotores",
      "data": [
        {"indice": i_sat[0], "hint": "UMA INDICAÇÃO", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[0]},
        {"indice": i_sat[1], "hint": "DUAS INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[1]},
        {"indice": i_sat[2], "hint": "TRÊS INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%" , "alert_color": lista_cor[2]},
        {"indice": i_sat[3], "hint": "QUATRO INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[3]},
        {"indice": i_sat[4], "hint": "CINCO INDICAÇÕES", "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor[4]}
      ],
      "agents": [
        {"tipo": cs_agents[0], "hint": cs_agents[0], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[0]},
        {"tipo": cs_agents[1], "hint": cs_agents[1], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[1]},
        {"tipo": cs_agents[2], "hint": cs_agents[2], "value": t_erro, "percent_value": str(p_erro) + "%", "alert_color": lista_cor_3[2]}
      ]
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
    width: 100%%;
    vertical-align: top;
  }
  .divSmall{
    display: -webkit-inline-box;
    width: calc(100%% - 1px);
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
    margin: 4px;
    background: #d8d8d8;
    padding: 12px;
  }
  .box_top, .box_content, .box_leg, .box_bottom {
    display: -webkit-inline-box;
    width: 100%%;
  }
  .box_title{
    font-size: 1.6em;
    margin: 4px;
    padding: 10px 8px;
    background-color: #edeeef;
    border: 1px solid #ccc;
    border-radius: 4px;
    display: block;
    width: 96%%;
  }
  .indice_sup{
    color: #333333;
    display: inline-block;
    font-size: 1.3em;
    line-height: .7em;
    padding-top: 10px;
  }
  .number_sup{
    display: inline-block;
    color: #F3EBF5;
    font-size: 1.2em;
    line-height: .7em;
    padding-top: 10px;
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
    margin: 5px 0;
    background: transparent;
    padding: 10px;
  }
  .graph_divider_2{
    border: 1px solid;
    display: inline-block;
    width: calc(50%% - 4px);
  }
  .total_height{
    height: 100%%;
  }
  .height_max{
    height: 50%%;
  }
  .height_divider{
    height: 100%%;
    margin-bottom: 6px;
  }
  #box01, #box03{
    width: 100%%;
  }
  #box02, #box04{
    width: 100%%;
  }
  .cs_mb_20 {
    margin-bottom: 20px;
  }
  .cs_md_2 {
    width: 19%%;
    margin: 5px 0px 5px 2px;
    position: relative;
    min-height: 1px;
    padding: 2px;
  }
  .cs_md_6 {
    width: 46%%;
    float: left;
    position: relative;
    min-height: 1px;
    padding: 2px;
  }
  .cs_md_12 {
    width: 96%%;
    margin: 0px;
    float: left;
    position: relative;
    min-height: 1px;
    padding: 2px;
  }
  .cs_md_offset_2 {
    margin: 0 4.165%% 0 12.495%%;;
  }
  .cs_md_offset_3 {
    margin: 0 12.5%%;
  }
  .cs_indice {
    display: block;
    margin-bottom: 5px;
    text-align: center;
    font-size: 1.4em;
    font-weight: bold;
  }
  .cs_box { 
    height: 40px;
    border-radius: 4px;
    padding: 5px;    
  }
  .cs_content_box {
    color: #fff;
    font-size: 1.2em;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
  }
  .cs_card {
    margin-right: 10px;
    padding: 20px 10px;
    border: 0px solid #CCC;
    border-radius: 4px;
    max-width: 23%%;
  }
  .cs_leg {
    font-size: 1.2em;
    font-weight: bold;
    text-align: center;
    width: 100%%;
    min-height: 1px;
  }
  .cs_destak {
    font-size: 60px;
    margin-top: -10px;
    margin-bottom: 0px;
    color: #4BA243;
    font-weight: bold;
  }
</style>

<!-- HTML -->

<div class="div_panel">
  <div class="total_height">
    <div class="divLarge height_max">
      <div class="height_divider">
        <div class="graph_divider_2 total_height">
          <div class="divSmall height_max box_01"></div>
        </div>
        <div class="graph_divider_2 total_height">
          <div class="divSmall height_max box_02"></div>
        </div>
      </div>
      <div class="height_divider">
        <div class="total_height" style="vertical-align: top;">
          <div class="graph_divider_2 total_height">
            <div class="divSmall height_max box_03"></div>
          </div>
          <div class="graph_divider_2 total_height">
            <div class="divSmall height_max box_04"></div>
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
  
  function renderBoxes(objData, elRender){

    var html = '';
    html += '<div class="box_top"><div class="box_title cs_mb_20">'+objData.question+'</div></div>';
    html += '<div class="box_content">';
    for (var i=0; i < objData.data.length; i++){
      var obj = objData.data[i];
      var estilo = '';
      html += '<div class="cs_md_2">';
      if(obj.alert_color){
        estilo = 'background: '+obj.alert_color+' !important;border: 1px solid '+obj.alert_color;
      }
      if(obj.link){
        html += '<div class="box_sup linkContent" style="'+estilo+'" data-link='+obj.link+' data-uk-tooltip="{pos:"left"}" title="'+obj.hint+'">';
      }
      if(obj.indice){
        html += '<div class="cs_indice">'+obj.indice+'</div>';
      }
      else{
        html += '<div class="box_sup cs_mb_20" data-uk-tooltip="{pos:"left"}" title="'+obj.hint+'">';
      }
      html += '<div class="cs_box cs_content_box" style="'+estilo+'">'+obj.value+ (obj.symbol ? obj.symbol : '');
      if(obj.percent_value){
        html += '<div class="cs_content_box">(' + obj.percent_value + ')</div></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="box_leg"><div class="cs_leg">'+objData.legend+'</div></div>';

    html += '<div class="box_bottom">';
      html += '<div class="cs_md_2 cs_card">';
          html += '<span><i class="glyphicon glyphicon-user cs-color-red"></i></span>';
          html += '<div class="text-center cs_leg">'+objData.agents[0].tipo+'</div>';
          html += '<h4 class="text-center text"><strong>'+objData.agents[0].value+'</strong>('+objData.agents[0].percent_value+')</h4>';
      html += '</div>';
      html += '<div class="cs_md_2 cs_card">';
          html += '<span><i class="glyphicon glyphicon-user cs-color-gray"></i></span>';
          html += '<div class="text-center cs_leg">'+objData.agents[1].tipo+'</div>';
          html += '<h4 class="text-center text"><strong>'+objData.agents[1].value+'</strong>('+objData.agents[1].percent_value+')</h4>';
      html += '</div>';
      html += '<div class="cs_md_2 cs_card">';
          html += '<span><i class="glyphicon glyphicon-user cs-color-green"></i></span>';                    
          html += '<div class="text-center cs_leg">'+objData.agents[2].tipo+'</div>';
          html += '<h4 class="text-center text"><strong>'+objData.agents[2].value+'</strong>('+objData.agents[2].percent_value+')</h4>';
      html += '</div>';
      html += ' <div class="cs_md_6 cs_card">';
          html += '<h2 class="text-center cs-destak">+40%%</h2>';
          html += '<div class="text-center cs_leg" style="margin-top: 0px;">Net Promoter Score (NPS).</div>';
      html += '</div>';
    html += '</div>';

    $('.'+elRender).append(html);
  }

  (function onInit(){
    setTimeout(function(){
      var data = %s;
      console.log(data);
      renderBoxes(data.box_01, 'box_01');
      renderBoxes(data.box_02, 'box_02');
      renderBoxes(data.box_03, 'box_03');
    }, 500);
  })();
</script>

"""% str(data)

csprogress.set_style_incalculable()
csprogress.set_incalculable_result({'html': HTML})
csprogress.set_success('Fim!')