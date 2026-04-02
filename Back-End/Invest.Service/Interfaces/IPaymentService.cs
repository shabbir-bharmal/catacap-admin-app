using Invest.Core.Dtos;
using Invest.Core.Models;
using Stripe;

namespace Invest.Service.Interfaces;

public interface IPaymentService
{
    Task<CommonResponse> ProcessCardPayment(CardPayment cardPaymentData);
    Task<List<PaymentMethodDetails>> CardPaymentMethods();
    Task<CommonResponse> ACHPaymentSecret(ACHPaymentSecret achPaymentSecretData);
    Task<CommonResponse> ProcessBankPayment(BankPayment bankPaymentData);
    Task WebhookCallForACHPaymentFailed(Charge charge);
    Task<CommonResponse> ACHPaymentRequest(ACHPaymentRequestDto requestDto, string adminEmails);
}