import { sendSuccess } from '../utils/response.js';
import * as marketSymbolService from '../services/marketSymbol.service.js';
import * as marketPriceService from '../services/marketPrice.service.js';

export const getSymbols = async (req, res) => {
  const data = await marketSymbolService.listSymbols(req.user.id);
  sendSuccess(res, data);
};

export const getSymbolPrice = async (req, res) => {
  const data = await marketPriceService.getPrice(req.params.symbol);
  sendSuccess(res, data);
};
