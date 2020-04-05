export var Strings = {

    /**
     * Verfica se um determinado conteudo está contido dentro de um string
     * qualquer.
     *
     * @param conteudo
     *            Representa a string que será verificada
     * @param busca
     *            Representa a string que será buscada na string padrão.
     * @return <code>true</code> a string contendo o padrão procurado,
     *         <code>false</code> caso contrário.
     */
    contains: function (padrao, procurada) {
        if (padrao == undefined || procurada == undefined) {
            return false;
        }

        if (padrao.indexOf(procurada) != -1) {
            return true;
        }

        return false;
    },
    /**
     * Verifica se uma string é igual a null ou vazia.
     *
     * @param str
     *            String a ser verificada.
     * @return <code>true</code> se a string for igual a null ou vazia,
     *         <code>false</code> caso contrário.
     */
    isNullOrEmpty: function (str) {
        if (str == undefined || str == null || str.trim(str) == '') {
            return true;
        }
        return false;
    },
    /**
     * Transforma uma date em uma data formatada
     * @param str
     *          String contendo a data
     *
     * @return String contendo a data formatada
     */
    formatarData: function (str) {
        var d = new Date(str || Date.now()),
            mes = '' + (d.getMonth() + 1),
            dia = '' + d.getDate(),
            ano = d.getFullYear();

        if (mes.length < 2) mes = '0' + mes;
        if (dia.length < 2) dia = '0' + dia;

        return [dia, mes, ano].join('/');
    },
    /**
     * Remover o sufixo da string. Caso o sufixo não seja encontrado, retorna str. Se ou str
     * ou suffix forem nulos, retorna str.
     *
     * @param str String contendo o sufixo
     * @param suffix Sufixo a ser removido
     * @returns String com o sufixo removido
     */
    removeSuffix(str, suffix) {
        if (!str || !suffix) {
            return str
        }

        if (str.toUpperCase().endsWith(suffix.toUpperCase())) {
            return str.substring(0, str.length - suffix.length)
        } else {
            return str
        }
    }

};

export var commons = {

    toID: function(value) {
        return value = "#".concat(value);
    },

    toClass: function(value) {
        return value = ".".concat(value);
    },

    toJsonSelect: function(list, id, text) {
        var json = '[';
        $.each(list, function (i, v) {
            json += '{ "value":"' + v[id] + '", "text":"' + v[text] + '"}, ';
        });
        json = json.substring(0, json.lastIndexOf(','));
        json += ']';
        return JSON.parse(json);
    },

    isMobile: function() {
        var userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.search(/(android|avantgo|blackberry|bolt|boost|cricket|docomo|fone|hiptop|mini|mobi|palm|phone|pie|tablet|up\.browser|up\.link|webos|wos)/i) != -1) {
            return true;
        }
        return false;
    },

    isAndroid: function() {
        var nav = navigator.userAgent.toLowerCase();
        return nav.indexOf("android") > -1;
    },

    convertDataURIToBinaryBuffer: function(dataURI) {

      var base64Index = dataURI.indexOf(';base64,') + ';base64,'.length;

      var base64 = dataURI.substring(base64Index);

      var buf = Buffer.from(base64, 'base64');

      return buf;

    },

    getImageOrientation: function(file, callback) {

        var reader = new FileReader();

        reader.onload = function(e) {

            var view = new DataView(e.target.result);

            if (view.getUint16(0, false) != 0xFFD8)
                return callback(-2);

            var length = view.byteLength, offset = 2;

            while (offset < length) {
                var marker = view.getUint16(offset, false);
                offset += 2;

                if (marker == 0xFFE1) {

                    if (view.getUint32(offset += 2, false) != 0x45786966)
                        return callback(-1);

                    var little = view.getUint16(offset += 6, false) == 0x4949;
                    offset += view.getUint32(offset + 4, little);
                    var tags = view.getUint16(offset, little);
                    offset += 2;

                    for (var i = 0; i < tags; i++)
                        if (view.getUint16(offset + (i * 12), little) == 0x0112)
                            return callback(view.getUint16(offset + (i * 12) + 8, little));
                }

                else if ((marker & 0xFF00) != 0xFF00)
                    break;
                else
                    offset += view.getUint16(offset, false);
            }

            return callback(-1);

        };

        reader.readAsArrayBuffer(file);

    },

    rotateBase64Image: function(base64, canvas, orientation, w, h, callback) {

        var image = new Image();
        image.src = base64;

        image.onload = function () {

            var context = canvas.getContext("2d");

            var cal = calculatePhoto(this.width, this.height, w, h);
            canvas.width = cal.width;
            canvas.height = cal.height;

            var width = cal.width,
                height = cal.height;

            // Set proper canvas dimensions before transform & export
            if ([5, 6, 7, 8].indexOf(orientation) > -1) {
                canvas.width = height;
                canvas.height = width;
            } else {
                canvas.width = width;
                canvas.height = height;
            }

            // transform context before drawing image
            switch (orientation) {
                case 2:
                    context.transform(-1, 0, 0, 1, width, 0);
                    break;
                case 3:
                    context.transform(-1, 0, 0, -1, width, height);
                    break;
                case 4:
                    context.transform(1, 0, 0, -1, 0, height);
                    break;
                case 5:
                    context.transform(0, 1, 1, 0, 0, 0);
                    break;
                case 6:
                    context.transform(0, 1, -1, 0, height, 0);
                    break;
                case 7:
                    context.transform(0, -1, -1, 0, height, width);
                    break;
                case 8:
                    context.transform(0, -1, 1, 0, 0, width);
                    break;
                default:
                    context.transform(1, 0, 0, 1, 0, 0);
            }

            // Draw image
            if (w > 0 && h > 0) {
                context.drawImage(image, 0, 0, cal.width, cal.height);
            } else {
                context.drawImage(image);
            }

            callback(canvas.toDataURL('image/png'));
        };

    },

    calculatePhoto: function (srcWidth, srcHeight, maxWidth, maxHeight) {
        var ratio = [maxWidth / srcWidth, maxHeight / srcHeight];
        ratio = Math.min(ratio[0], ratio[1]);

        return {
            width: srcWidth * ratio,
            height: srcHeight * ratio
        };
    },

    isBase64: function(base64) {

        var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/

        base64regex.test(base64)

    }

}
