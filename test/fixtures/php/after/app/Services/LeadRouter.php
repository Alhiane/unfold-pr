<?php
namespace App\Services;

class LeadRouter
{
    public function route(array $lead): string
    {
        if ($this->isDuplicate($lead)) {
            return 'rejected';
        }
        $buyer = $this->pickBuyer($lead);
        return $buyer ?? $this->fallbackQueue($lead);
    }

    private function isDuplicate(array $lead): bool
    {
        return Lead::where('email', $this->normalizeEmail($lead['email']))->exists();
    }

    private function pickBuyer(array $lead): ?string
    {
        $buyers = $this->eligibleBuyers($lead['country']);
        usort($buyers, fn ($a, $b) => $b['bid'] <=> $a['bid']);
        return $buyers[0]['id'] ?? null;
    }

    private function eligibleBuyers(string $country): array
    {
        return Buyer::active()->where('country', $country)->get()->toArray();
    }

    private function fallbackQueue(array $lead): string
    {
        return 'queue:' . strtolower($lead['country']);
    }

    private function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    private function scoreLead(array $lead): int
    {
        return isset($lead['phone']) ? 2 : 1;
    }
}
