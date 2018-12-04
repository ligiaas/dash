from datetime import datetime, timedelta
from cs.custom.misc import localize_to_utc, localize_from_utc, convert_stringtodatetime
from uuid import uuid1
from cs.apps.analytics.interface import execute
from cs.utils.cassandra_utils import datetime_to_cql
from pandas import Series
import requests
from json import loads
from cs.conf import settings, resolve_pymongo_connection

#initialize()



guid = uuid1()
empresa = 'gama'

canal = 'smart'

# QUANDO VIRAR O MES MUDA DATA
hoje = datetime.now()
dia = hoje.day
mes = hoje.month
ano = hoje.year
data_inicial = datetime(ano, mes, 1, 0, 0, 0)
data_final = localize_to_utc(datetime.now() + timedelta(days=1))


# data_inicial = localize_to_utc(convert_stringtodatetime(kwargs.get('initial_date')))
# data_final = localize_to_utc(convert_stringtodatetime(kwargs.get('final_date')))

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
	# host_url = requests.get('https://amx.cscloud.biz/csapi/v2/monitor/?cssession={}'.format('0c04a610-7e35-11e8-9e6d-005056bb309c'))
	total_usuarios = 0
	if host_url.status_code == 200:
		result = loads(host_url.content.decode('latin1'))
	else:
		result = None
		raise Exception('Erro ao chamar URL [{}]'.format(host_url.status_code))

	if result:
		total_usuarios = result['qtt_total']

	return total_usuarios


"""
AND 
		"LABEL" = '{}' ALLOW FILTERING;
"""


def busca_dados(dt_ini, dt_fim):
	sql_SC = '''SELECT "DATA_OCORRENCIA", "LABEL", "VALUE" FROM "R_REL_PESQUISA" 
	WHERE 
		"DATA_OCORRENCIA" >= '{}' AND
		"DATA_OCORRENCIA" <= '{}' ALLOW FILTERING;  '''.format(datetime_to_cql(dt_ini), datetime_to_cql(dt_fim))

	return execute(empresa, sql_SC)


guid = uuid1()
P_1 = 'Como você avalia o atendimento em relação aos esclarecimentos recebidos?'
P_2 = 'Agora, como você avalia o atendimento com relação a resolução de sua solicitação?'
P_3 = 'E por fim, como você avalia a qualidade do atendimento prestado pelo analista?'

PERGUNTA_1 = {
	'Como você avalia o atendimento em relação aos esclarecimentos recebidos?': {'1': 0, '2': 0, '3': 0, '4': 0,
																				 '5': 0}, 'total': 0}
PERGUNTA_2 = {
	'Agora, como você avalia o atendimento com relação a resolução de sua solicitação?': {'1': 0, '2': 0, '3': 0,
																						  '4': 0, '5': 0}, 'total': 0}
PERGUNTA_3 = {
	'E por fim, como você avalia a qualidade do atendimento prestado pelo analista?': {'1': 0, '2': 0, '3': 0, '4': 0,
																					   '5': 0}, 'total': 0}

L_DIA = dict()
L_HORA = dict()
MPL = dict()
SP = dict()
lista_duracao = []

dados = busca_dados(data_inicial, data_final)
indica_retencao = []
limite = 6
# coll_fossil_tab = resolve_pymongo_connection(settings.FOSSIL, replicaset_name='analyticsfdb', default_port='64302')[empresa]['fossil_ContactTabCapsula']

for dado in dados.result():
	info = dado.VALUE
	a = {
		"abandonado": "",
		"ani": "LIA1__at__gama",
		"canal_entrada": "mapfre_pesquisa",
		"dnis": "77777",
		"duracao_ura": "37",
		"fim_ura": "1543253082.0",
		"id_capsula": "5bfc2c6afa5320259ab2b3c5",
		"ini_ura": "1543253045.0",
		"is_transfer": "",
		"media_id": "407d8b15-8abd-4b56-b278-348c15a66c48",
		"p_1": "Como você avalia o atendimento em relação aos esclarecimentos recebidos?",
		"p_2": "Agora, como você avalia o atendimento com relação a resolução de sua solicitação?",
		"p_3": "E por fim, como você avalia a qualidade do atendimento prestado pelo analista?",
		"qtd_perguntas": "3",
		"r_1": "Avaliou como Ruim os esclarecimentos prestados",
		"r_2": "Avaliou como Excelente a resolução da solicitação",
		"r_3": "Avaliou como Ótimo a qualidade do atendimento prestado pelo analista",
		"scriptpoint": "Mensagem de Tchau",
		"scriptpoint_cod": "0.1",
		"sp_perguntas_cod": "1.1|2.5|3.4",
		"time_stamp": "26/11/2018 15:24:58",
		"vdn": ""
	}
	sp_perguntas_cod = info['sp_perguntas_cod'].split('|')

	p_1 = info.get('p_1', '')
	p_2 = info.get('p_2', '')
	p_3 = info.get('p_3', '')

	if p_1 != '':
		num_r = sp_perguntas_cod[0].split('.')[1]
		PERGUNTA_1[p_1][num_r] += 1
		PERGUNTA_1['total'] += 1

	if p_2 != '':
		num_r = sp_perguntas_cod[1].split('.')[1]
		PERGUNTA_2[p_2][num_r] += 1
		PERGUNTA_2['total'] += 1

	if p_3 != '':
		num_r = sp_perguntas_cod[2].split('.')[1]
		PERGUNTA_3[p_3][num_r] += 1
		PERGUNTA_3['total'] += 1

cor_p1 = {}
PERGUNTA_1['detratores'] = PERGUNTA_1[P_1]['1'] + PERGUNTA_1[P_1]['2']
cor_p1['detratores'] =  PERGUNTA_1['detratores']
PERGUNTA_1['passivos'] = PERGUNTA_1[P_1]['3']
cor_p1['passivos'] = PERGUNTA_1['passivos']
PERGUNTA_1['promotores'] = PERGUNTA_1[P_1]['4'] + PERGUNTA_1[P_1]['5']
cor_p1['promotores'] =  PERGUNTA_1['promotores']

max_p1 = max(cor_p1.keys(), key=lambda k: cor_p1[k])


cor_p2 = {}

PERGUNTA_2['detratores'] = PERGUNTA_2[P_2]['1'] + PERGUNTA_2[P_2]['2']
cor_p2['detratores'] =  PERGUNTA_2['detratores']
PERGUNTA_2['passivos'] = PERGUNTA_2[P_2]['3']
cor_p2['passivos'] =  PERGUNTA_2['passivos']
PERGUNTA_2['promotores'] = PERGUNTA_2[P_2]['4'] + PERGUNTA_2[P_2]['5']
cor_p2['promotores'] =  PERGUNTA_2['promotores']
max_p2 = max(cor_p2.keys(), key=lambda k: cor_p2[k])


cor_p3 = {}
PERGUNTA_3['detratores'] = PERGUNTA_3[P_3]['1'] + PERGUNTA_3[P_3]['2']
cor_p3['detratores'] =  PERGUNTA_3['detratores']
PERGUNTA_3['passivos'] = PERGUNTA_3[P_3]['3']
cor_p3['passivos'] =  PERGUNTA_3['passivos']
PERGUNTA_3['promotores'] = PERGUNTA_3[P_3]['4'] + PERGUNTA_3[P_3]['5']
cor_p3['promotores'] =  PERGUNTA_3['promotores']

max_p3 = max(cor_p3.keys(), key=lambda k: cor_p3[k])

#print(PERGUNTA_1)
#print(PERGUNTA_2)
#print(PERGUNTA_3)
###############trata dados da BOX ###############################
# hc = retornaHC()
# media = "00:00:00"
i_sat = ['Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente']
cs_agents = ['Detratores', 'Passivos', 'Promotores']
lista_cor_det = ['#D31925', '#F06730', '#F58D32', '#FAAE33', '#FFD52D']
lista_cor_pas = ['#D9D9D9', '#C9C9CA', '#A5A5A7', '#7D8289', '#494C50']
lista_cor_pro = ['#BBE1B7', '#98D293', '#65BB5D', '#43903C', '#2A5A26']
lista_cor_geral = ['#D31925', '#F06730', '#FFD700', '#43903C', '#2A5A26'] #cinza = #A5A5A7
lista_cor_3 = ['#FFFFFF', '#FFD700', '#4BA243']  # '#D31925' amarelo = #FFD700 , cinza = '#C9C9CA'
maior_cores = {'detratores': '#D31925', 'passivos': '#FFD700', 'promotores': '#4BA243'}

###############Trata dados do grafico de hora  ###############################
"""grafico_hora = [{'hour': d_hour,
				 'transf': dados_hora['transf'],
				 'retidas': dados_hora['retidas'],
				 'total': dados_hora['total']} for d_hour, dados_hora in L_HORA.items()]

grafico_hora = sorted(grafico_hora, key=lambda d: d['hour'])
"""

data = {
	"pizza": [{"label": "BOM", "value": 2},
			  {"label": "RUIM", "value": 2},
			  {"label": "PESSIMO", "value": 3},
			  {"label": "OTIMO", "value": 5},
			  {"label": "MAXIMO", "value": 5}],

	"product": 'Sofie',
	"box_01": {
		"question": '1- '+P_1,

		"data": [
			{"indice": i_sat[0], "hint": "UMA INDICAÇÃO", "value": PERGUNTA_1[P_1]['1'],
			 "percent_value": str(round((PERGUNTA_1[P_1]['1'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[0]},
			{"indice": i_sat[1], "hint": "DUAS INDICAÇÕES", "value": PERGUNTA_1[P_1]['2'],
			 "percent_value": str(round((PERGUNTA_1[P_1]['2'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[1]},
			{"indice": i_sat[2], "hint": "TRÊS INDICAÇÕES", "value": PERGUNTA_1[P_1]['3'],
			 "percent_value": str(round((PERGUNTA_1[P_1]['3'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[2]},
			{"indice": i_sat[3], "hint": "QUATRO INDICAÇÕES", "value": PERGUNTA_1[P_1]['4'],
			 "percent_value": str(round((PERGUNTA_1[P_1]['4'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[3]},
			{"indice": i_sat[4], "hint": "CINCO INDICAÇÕES", "value": PERGUNTA_1[P_1]['5'],
			 "percent_value": str(round((PERGUNTA_1[P_1]['5'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[4]}
		],
		"agents": [
			{"tipo": cs_agents[0], "hint": cs_agents[0], "value": PERGUNTA_1['detratores'],
			 "percent_value": str(round((PERGUNTA_1['detratores'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																											   'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color": maior_cores[max_p1] if 'detratores' == max_p1 else '#FFFFFF' },
			{"tipo": cs_agents[1], "hint": cs_agents[1], "value": PERGUNTA_1['passivos'],
			 "percent_value": str(round((PERGUNTA_1['passivos'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																											 'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color": maior_cores[max_p1] if 'passivos' == max_p1 else '#FFFFFF'},
			{"tipo": cs_agents[2], "hint": cs_agents[2], "value": PERGUNTA_1['promotores'],
			 "percent_value": str(round((PERGUNTA_1['promotores'] / PERGUNTA_1['total']) * 100)) + ' %' if PERGUNTA_1[
																											   'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color":  maior_cores[max_p1] if 'promotores' == max_p1 else '#FFFFFF' },

            {"tipo": cs_agents[2], "hint": cs_agents[2], "value": PERGUNTA_1['total'],
			 "percent_value": '',
			 "icon": "glyphicons-user", "icon_color": lista_cor_3[2]}

		]
	},
	"box_02": {
		"question": '2- '+P_2,
		"legend": [],
		"data": [
			{"indice": i_sat[0], "hint": "UMA INDICAÇÃO", "value": PERGUNTA_2[P_2]['1'],
			 "percent_value": str(round((PERGUNTA_2[P_2]['1'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[0]},
			{"indice": i_sat[1], "hint": "DUAS INDICAÇÕES", "value": PERGUNTA_2[P_2]['2'],
			 "percent_value": str(round((PERGUNTA_2[P_2]['2'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[1]},
			{"indice": i_sat[2], "hint": "TRÊS INDICAÇÕES", "value": PERGUNTA_2[P_2]['3'],
			 "percent_value": str(round((PERGUNTA_2[P_2]['3'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[2]},
			{"indice": i_sat[3], "hint": "QUATRO INDICAÇÕES", "value": PERGUNTA_2[P_2]['4'],
			 "percent_value": str(round((PERGUNTA_2[P_2]['4'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[3]},
			{"indice": i_sat[4], "hint": "CINCO INDICAÇÕES", "value": PERGUNTA_2[P_2]['5'],
			 "percent_value": str(round((PERGUNTA_2[P_2]['5'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[4]}
		],
		"agents": [
			{"tipo": cs_agents[0], "hint": cs_agents[0], "value": PERGUNTA_2['detratores'],
			 "percent_value": str(round((PERGUNTA_2['detratores'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																											   'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color": maior_cores[max_p2] if 'detratores' == max_p2 else '#FFFFFF'},
			{"tipo": cs_agents[1], "hint": cs_agents[1], "value": PERGUNTA_2['passivos'],
			 "percent_value": str(round((PERGUNTA_2['passivos'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																											 'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color": maior_cores[max_p2] if 'passivos' == max_p2 else '#FFFFFF'},
			{"tipo": cs_agents[2], "hint": cs_agents[2], "value": PERGUNTA_2['promotores'],
			 "percent_value": str(round((PERGUNTA_2['promotores'] / PERGUNTA_2['total']) * 100)) + ' %' if PERGUNTA_2[
																											   'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color": maior_cores[max_p2] if 'promotores' == max_p2 else '#FFFFFF'},

            {"tipo": cs_agents[2], "hint": cs_agents[2], "value": PERGUNTA_2['total'],
			 "percent_value": '',
			 "icon": "glyphicons-user", "icon_color": lista_cor_3[2]}

		]
	},
	"box_03": {
		"question": '3- '+P_3,
		"legend": "",
		"data": [
			{"indice": i_sat[0], "hint": "UMA INDICAÇÃO", "value": PERGUNTA_3[P_3]['1'],
			 "percent_value": str(round((PERGUNTA_3[P_3]['1'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[0]},
			{"indice": i_sat[1], "hint": "DUAS INDICAÇÕES", "value": PERGUNTA_3[P_3]['2'],
			 "percent_value": str(round((PERGUNTA_3[P_3]['2'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[1]},
			{"indice": i_sat[2], "hint": "TRÊS INDICAÇÕES", "value": PERGUNTA_3[P_3]['3'],
			 "percent_value": str(round((PERGUNTA_3[P_3]['3'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[2]},
			{"indice": i_sat[3], "hint": "QUATRO INDICAÇÕES", "value": PERGUNTA_3[P_3]['4'],
			 "percent_value": str(round((PERGUNTA_3[P_3]['4'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[3]},
			{"indice": i_sat[4], "hint": "CINCO INDICAÇÕES", "value": PERGUNTA_3[P_3]['5'],
			 "percent_value": str(round((PERGUNTA_3[P_3]['5'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																										   'total'] > 0 else '0 %',
			 "box_color": lista_cor_geral[4]}
		],
		"agents": [
			{"tipo": cs_agents[0], "hint": cs_agents[0], "value": PERGUNTA_3['detratores'],
			 "percent_value": str(round((PERGUNTA_3['detratores'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																											   'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color": maior_cores[max_p3] if 'detratores' == max_p3 else '#FFFFFF'},
			{"tipo": cs_agents[1], "hint": cs_agents[1], "value": PERGUNTA_3['passivos'],
			 "percent_value": str(round((PERGUNTA_3['passivos'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																											 'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color":  maior_cores[max_p3] if 'passivos' == max_p3 else '#FFFFFF'},
			{"tipo": cs_agents[2], "hint": cs_agents[2], "value": PERGUNTA_3['promotores'],
			 "percent_value": str(round((PERGUNTA_3['promotores'] / PERGUNTA_3['total']) * 100)) + ' %' if PERGUNTA_3[
																											   'total'] > 0 else '0 %',
			 "icon": "glyphicons-user", "icon_color":maior_cores[max_p3] if 'promotores' == max_p3 else '#FFFFFF'},

            {"tipo": cs_agents[2], "hint": cs_agents[2], "value": PERGUNTA_3['total'],
			 "percent_value": '',
			 "icon": "glyphicons-user", "icon_color": lista_cor_3[2]}

		]
	}
}

HTML = """
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
	background: #D8D8D8;
	padding: 12px;
  }
  .box_top, .box_content, .box_leg, .box_bottom {
	display: -webkit-inline-box;
	width: 100%%;
  }
  .bx_leg {
	display: -webkit-inline-box;
	width: 100%%;
  }
  .graph_divider_2{
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
  .cs_mb_15 {
	margin-bottom: 15px;
  }
  .cs_md_2 {
	width: 19%%;
	margin: 5px 0px 2px 2px;
	position: relative;
	min-height: 1px;
	padding: 2px;
  }
  .cs_md_6 {
	width: 33%%;
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
  .cs_box {
  height: 34px;
  border-radius: 4px;
  padding: 1px;
	}
	.cs_card {
  margin: 2px 5px;
  height: 82px;
  border: 1px solid #CCC;
  border-radius: 4px;
	}
  .cs_card:last-child {
  margin: 2px 0px 2px 5px;
  }
  .box_title {
  font-size: 1.3em;
  line-height: 1.3;
  margin: 4px;
  padding: 8px;
  background-color: #EDEEEF;
  border: 1px solid #CCC;
  border-radius: 4px;
  display: block;
  width: 96%%;
	}
	.box_title:last-child {
		margin-top: 6px;
	}
  .cs_indice {
  display: block;
  margin-bottom: 5px;
  text-align: center;
  font-size: 1.25em;
  font-weight: bold;
	}
  .cs_content_box {
	color: #FFF;
	font-size: 1.1em;
	font-weight: bold;
	text-align: center;
	text-transform: uppercase;
  }
  .cs_text {
  font-size: 1em;
  font-weight: bold;
  width: 100%%;
  margin-top: 1px;
  min-height: 1px;
	}
  .cs_leg {
	font-size: 1.2em;
	font-weight: bold;
	display: inline;
	width: 100%%;
	min-height: 1px;
	padding-left: 25%%;
  }
  .cs_destak {
	font-size: 4em;
	margin: 7px 0px 12px 0px;
	color: #4BA243;
	font-weight: bold;
  }
  .cs_text_center {
	text-align: center;
  }
  h4 {
	margin-top: 0px;
	margin-bottom: 0;
  }
  .cs_glyphicons {
	display: block;
	font-size: 4em;
  }
  .glyphicons:before {
	padding: 0;
  }

  @media(min-width:1024px) {
    .box_title {
      font-size: 1.2em;
      line-height: 1.2;
      padding: 6px 8px;
    }
  	cs_md_6 {
      width: 33%%;
    }
  }
</style>

<!-- HTML -->

<div class="div_panel" style="border: 1px solid;">
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
		  <div id="chartdiv" class="graph_divider_2 total_height">
			<div class="divSmall height_max box_04"></div>
		  </div>
		</div>
	  </div>
	</div>
  </div>
</div>
<!-- SCRIPT -->
<script src="https://www.amcharts.com/lib/3/xy.js"></script>
<script src="https://www.amcharts.com/lib/3/plugins/export/export.min.js"></script>
<link rel="stylesheet" href="https://www.amcharts.com/lib/3/plugins/export/export.css" type="text/css" media="all" />
<script src="https://www.amcharts.com/lib/4/themes/animated.js"></script>
		
<script>

  $('body').off('click', '.linkTopo');
  $('body').on('click', '.linkTopo', function(){
	window.open($(this).attr('data-link'));
  });
  
  /*
  var chart = AmCharts.makeChart("chartdiv", {
     //"id": "grafico4"
     "type": "xy",
     "theme": "none",
     "marginRight": 80,
     "marginTop": 17,
     "dataProvider": [{
         "y": 10,
         "x": 14,
         "value": 59,
         "y2": -5,
         "x2": 0,
         "value2": 44
     }, {
         "y": 5,
         "x": 3,
         "value": 50,
         "y2": -15,
         "x2": -8,
         "value2": 12
     }, {
         "y": -10,
         "x": -3,
         "value": 19,
         "y2": -4,
         "x2": 6,
         "value2": 35
     }, {
         "y": -6,
         "x": 5,
         "value": 65,
         "y2": -5,
         "x2": -6,
         "value2": 168
     }, {
         "y": 15,
         "x": -4,
         "value": 92,
         "y2": -10,
         "x2": -8,
         "value2": 102
     }, {
         "y": 13,
         "x": 1,
         "value": 8,
         "y2": -2,
         "x2": -3,
         "value2": 41
     }, {
         "y": 1,
         "x": 6,
         "value": 35,
         "y2": 0,
         "x2": 1,
         "value2": 16
     }],
     "valueAxes": [{
         "position": "bottom",
         "axisAlpha": 0
     }, {
         "minMaxMultiplier": 1.2,
         "axisAlpha": 0,
         "position": "left"
     }],
     "startDuration": 1.5,
     "graphs": [{
         "balloonText": "x:<b>[[x]]</b> y:<b>[[y]]</b><br>value:<b>[[value]]</b>",
         "bullet": "bubble",
         "lineAlpha": 0,
         "valueField": "value",
         "xField": "x",
         "yField": "y",
         "fillAlphas": 0,
         "bulletBorderAlpha": 0.2,
         "maxBulletSize": 80

     }, {
         "balloonText": "x:<b>[[x]]</b> y:<b>[[y]]</b><br>value:<b>[[value]]</b>",
         "bullet": "bubble",
         "lineAlpha": 0,
         "valueField": "value2",
         "xField": "x2",
         "yField": "y2",
         "fillAlphas": 0,
         "bulletBorderAlpha": 0.2,
         "maxBulletSize": 80

     }],
     "marginLeft": 46,
     "marginBottom": 35,
     "chartScrollbar": {},
     "chartCursor": {},
     "balloon":{
      "fixedPosition":true
     },
     "export": {
         "enabled": true
     }
 });
 */

  function renderBoxes(objData, elRender, nume, dad){

	var html = '';
	html += '<div class="box_top"><div class="box_title cs_mb_15">'+objData.question+'</div></div>';
	html += '<div class="box_content">';
	for (var i=0; i < objData.data.length; i++){
	  var obj = objData.data[i];
	  var estilo = '';
	  html += '<div class="cs_md_2">';
	  if(obj.box_color){
		estilo = 'background: '+obj.box_color+' !important;border: 1px solid '+obj.box_color;
	  }
	  if(obj.link){
		html += '<div class="box_sup linkContent" style="'+estilo+'" data-link='+obj.link+' data-uk-tooltip="{pos:"left"}" title="'+obj.hint+'">';
	  }
	  if(obj.indice){
		html += '<div class="cs_indice" data-uk-tooltip="{pos:"left"}" title="'+obj.hint+'">'+obj.indice+'</div>';
	  }
	  else{
		html += '<div class="box_sup cs_mb_15" data-uk-tooltip="{pos:"left"}" title="'+obj.hint+'">';
	  }
	  html += '<div class="cs_box cs_content_box" style="'+estilo+'">'+obj.value+ (obj.symbol ? obj.symbol : '');
	  if(obj.percent_value){
		html += '<div class="cs_content_box">(' + obj.percent_value + ')</div></div>';
	  }
	  html += '</div>';
		}
		html += '</div>'; 

		html += '<div class="box_bottom">';
		  html += '<div class="cs_md_2 cs_card">';
			  html += '<div class="cs_text_center"><img src="/resources/images/cs_sad.png" width="45" height="45" style="background-color: '+objData.agents[0].icon_color+'; border-radius: 26px; width: 45px;height: 45px;"></div>';
			  html += '<div class="cs_text_center cs_text">'+objData.agents[0].tipo+'</div>';
			  html += '<h4 class="cs_text_center text"><strong>'+objData.agents[0].value+'</strong>('+objData.agents[0].percent_value+')</h4>';
		  html += '</div>';
		  html += '<div class="cs_md_2 cs_card">';
			  html += '<div class="cs_text_center"><img src="/resources/images/cs_meh.png" width="45" height="45" style="background-color: '+objData.agents[1].icon_color+'; border-radius: 26px; width: 45px;height: 45px;"></div>';
			  html += '<div class="cs_text_center cs_text">'+objData.agents[1].tipo+'</div>';
			  html += '<h4 class="cs_text_center text"><strong>'+objData.agents[1].value+'</strong>('+objData.agents[1].percent_value+')</h4>';
		  html += '</div>';
		  html += '<div class="cs_md_2 cs_card">';
			  html += '<div class="cs_text_center"><img src="/resources/images/cs_smile.png" width="45" height="45" style="background-color: '+objData.agents[2].icon_color+'; border-radius: 26px; width: 45px;height: 45px;"></div>';                    
			  html += '<div class="cs_text_center cs_text">'+objData.agents[2].tipo+'</div>';
			  html += '<h4 class="cs_text_center text"><strong>'+objData.agents[2].value+'</strong>('+objData.agents[2].percent_value+')</h4>';
		  html += '</div>';
	    html += ' <div class="cs_md_6 cs_card">';
	      html += '<h2 class="cs_text_center cs_destak">'+ objData.agents[3].value +'</h2>';
	      html += '<div class="cs_text_center cs_text" style="margin-top: 0px;">TOTAL DE RESPOSTAS</div>';
		  html += '</div>';
		html += '</div>';

		$('.'+elRender).append(html);
  }

  (function onInit(){
	setTimeout(function(){
	  var data = %s;
	  console.log(data);



	  renderBoxes(data.box_01, 'box_01', 1, data.pizza);
	  renderBoxes(data.box_02, 'box_02', 2, data.pizza);
	  renderBoxes(data.box_03, 'box_03', 3, data.pizza);
	}, 500);
  })();
</script>

""" % str(data)

csprogress.set_style_incalculable()
csprogress.set_incalculable_result({'html': HTML})
csprogress.set_success('Fim!')